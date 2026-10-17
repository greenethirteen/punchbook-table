// Minimal SambaPOS V5 Message Server client: password-grant token + GraphQL.
// Uses node:http directly so we can fall back to a lenient HTTP parser; the SambaPOS
// server is known to send slightly malformed status lines that strict clients reject.
// agent: false = fresh connection per request; avoids resets if the server closes keep-alive sockets silently.
import http from 'node:http';
import https from 'node:https';

export class SambaError extends Error {
  constructor(kind, message, details) {
    super(message);
    this.kind = kind; // 'config' | 'connection' | 'auth' | 'http' | 'graphql'
    this.details = details;
  }
}

const PARSER_ERRORS = /^HPE_/;

function rawRequest(url, {method = 'GET', headers = {}, body, lenient = false, timeoutMs = 15000}) {
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(url, {method, headers, agent: false, insecureHTTPParser: lenient, timeout: timeoutMs}, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8')}));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error(`No response after ${timeoutMs / 1000}s`), {code: 'ETIMEDOUT'})));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

export function createSambaClient({url, user, password, clientId, log = () => {}}) {
  const missing = Object.entries({SAMBA_URL: url, SAMBA_USER: user, SAMBA_PASSWORD: password, SAMBA_CLIENT_ID: clientId})
    .filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new SambaError('config', `Missing settings in .env: ${missing.join(', ')}`);
  let base;
  try { base = new URL(url.replace(/\/+$/, '') + '/'); }
  catch { throw new SambaError('config', `SAMBA_URL is not a valid URL: ${url}`); }

  let lenient = false, token = null;

  async function request(path, opts) {
    const target = new URL(path, base);
    try {
      return await rawRequest(target, {...opts, lenient});
    } catch (e) {
      if (!lenient && PARSER_ERRORS.test(e.code || '')) {
        log(`Server sent malformed HTTP (${e.code}: ${e.reason || e.message}). Retrying with lenient parser (insecureHTTPParser).`);
        lenient = true;
        return request(path, opts);
      }
      const hint = {
        ECONNREFUSED: 'Connection refused. Is the SambaPOS Message Server running on that port?',
        EHOSTUNREACH: 'Host unreachable. Check the IP and that this machine is on the same network.',
        ENOTFOUND: 'Host name not found. Check SAMBA_URL.',
        ETIMEDOUT: 'Timed out. Check the IP, and that Windows Firewall allows inbound connections on the port.',
        ECONNRESET: 'Connection was reset by the server.'
      }[e.code] || e.message;
      throw new SambaError('connection', `Cannot reach SambaPOS at ${target.origin}: ${hint}`, {code: e.code});
    }
  }

  function parseJson(res, what) {
    try { return JSON.parse(res.text); }
    catch { throw new SambaError('http', `${what}: expected JSON but got HTTP ${res.status}: ${res.text.slice(0, 300) || '(empty body)'}`); }
  }

  async function login() {
    const form = new URLSearchParams({grant_type: 'password', username: user, password, client_id: clientId}).toString();
    const res = await request('Token', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form)},
      body: form
    });
    const data = res.text ? (() => { try { return JSON.parse(res.text); } catch { return null; } })() : null;
    if (res.status !== 200 || !data?.access_token) {
      const reason = data?.error_description || data?.error || res.text.slice(0, 300) || '(empty body)';
      throw new SambaError('auth', `Login failed (HTTP ${res.status}): ${reason}`, data);
    }
    token = {accessToken: data.access_token, refreshToken: data.refresh_token || null, expiresIn: data.expires_in ?? null, tokenType: data.token_type || 'bearer'};
    return token;
  }

  async function graphql(query, variables) {
    if (!token) await login();
    const body = JSON.stringify(variables ? {query, variables} : {query});
    const res = await request('api/graphql', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Authorization: `Bearer ${token.accessToken}`},
      body
    });
    if (res.status === 401) throw new SambaError('auth', 'GraphQL rejected the token (HTTP 401). It may have expired, or the user lacks API access.');
    const data = parseJson(res, 'GraphQL');
    if (data.errors?.length) {
      throw new SambaError('graphql', 'GraphQL error: ' + data.errors.map(e => e.message).join(' | '), data.errors);
    }
    if (res.status !== 200) throw new SambaError('http', `GraphQL returned HTTP ${res.status}: ${res.text.slice(0, 300)}`);
    return data.data;
  }

  return {login, graphql, get usedLenientParser() { return lenient; }};
}
