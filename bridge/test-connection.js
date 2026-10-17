// Phase 1: prove we can talk to SambaPOS. Logs in, saves the GraphQL schema, prints the menu.
// Does NOT create tickets.  Run: npm run test-connection
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSambaClient, SambaError} from './samba-client.js';

const here = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(here, '.env')); }
catch (e) { if (e.code !== 'ENOENT') throw e; }

const SCHEMA_DIR = path.join(here, 'schema');

const INTROSPECTION = `query IntrospectionQuery {
  __schema {
    queryType { name } mutationType { name } subscriptionType { name }
    types { ...FullType }
  }
}
fragment FullType on __Type {
  kind name description
  fields(includeDeprecated: true) { name description args { ...InputValue } type { ...TypeRef } isDeprecated deprecationReason }
  inputFields { ...InputValue }
  interfaces { ...TypeRef }
  enumValues(includeDeprecated: true) { name description isDeprecated deprecationReason }
  possibleTypes { ...TypeRef }
}
fragment InputValue on __InputValue { name description type { ...TypeRef } defaultValue }
fragment TypeRef on __Type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }`;

const typeRef = t => t.kind === 'NON_NULL' ? typeRef(t.ofType) + '!' : t.kind === 'LIST' ? `[${typeRef(t.ofType)}]` : t.name;
const args = a => a.length ? `(${a.map(x => `${x.name}: ${typeRef(x.type)}${x.defaultValue != null ? ' = ' + x.defaultValue : ''}`).join(', ')})` : '';

// Plain-text SDL-ish dump so the schema is easy to read and diff.
function schemaToText(schema) {
  const types = schema.types.filter(t => !t.name.startsWith('__')).sort((a, b) => a.name.localeCompare(b.name));
  const root = [schema.queryType?.name, schema.mutationType?.name, schema.subscriptionType?.name].filter(Boolean);
  const order = [...root.map(n => types.find(t => t.name === n)).filter(Boolean), ...types.filter(t => !root.includes(t.name))];
  return order.map(t => {
    if (t.kind === 'SCALAR') return `scalar ${t.name}`;
    if (t.kind === 'ENUM') return `enum ${t.name} {\n${t.enumValues.map(v => '  ' + v.name).join('\n')}\n}`;
    if (t.kind === 'UNION') return `union ${t.name} = ${t.possibleTypes.map(p => p.name).join(' | ')}`;
    const keyword = {INPUT_OBJECT: 'input', INTERFACE: 'interface'}[t.kind] || 'type';
    const fields = t.kind === 'INPUT_OBJECT'
      ? t.inputFields.map(f => `  ${f.name}: ${typeRef(f.type)}`)
      : (t.fields || []).map(f => `  ${f.name}${args(f.args)}: ${typeRef(f.type)}${f.isDeprecated ? ' @deprecated' : ''}`);
    return `${keyword} ${t.name} {\n${fields.join('\n')}\n}`;
  }).join('\n\n') + '\n';
}

const ok = msg => console.log(`  ✓ ${msg}`);
const step = msg => console.log(`\n${msg}`);

async function main() {
  const client = createSambaClient({
    url: process.env.SAMBA_URL,
    user: process.env.SAMBA_USER,
    password: process.env.SAMBA_PASSWORD,
    clientId: process.env.SAMBA_CLIENT_ID,
    log: m => console.log(`  ! ${m}`)
  });

  step(`1. Logging in to ${process.env.SAMBA_URL} as "${process.env.SAMBA_USER}"...`);
  const token = await client.login();
  ok(`Token received (${token.accessToken.slice(0, 6)}..., ${token.accessToken.length} chars)` +
    `${token.expiresIn ? `, expires in ${token.expiresIn}s` : ''}${token.refreshToken ? ', refresh token included' : ''}`);

  step('2. Downloading GraphQL schema (introspection)...');
  const {__schema: schema} = await client.graphql(INTROSPECTION);
  await fs.mkdir(SCHEMA_DIR, {recursive: true});
  await fs.writeFile(path.join(SCHEMA_DIR, 'schema.json'), JSON.stringify(schema, null, 2));
  await fs.writeFile(path.join(SCHEMA_DIR, 'schema.graphql'), schemaToText(schema));
  const byName = n => schema.types.find(t => t.name === n);
  const queries = byName(schema.queryType?.name)?.fields || [];
  const mutations = byName(schema.mutationType?.name)?.fields || [];
  ok(`${schema.types.length} types, ${queries.length} queries, ${mutations.length} mutations`);
  ok(`Saved bridge/schema/schema.json and bridge/schema/schema.graphql`);
  const ticketMutations = mutations.filter(m => /ticket|payment|print|automation|refresh|broadcast/i.test(m.name));
  if (ticketMutations.length) {
    console.log('  Mutations relevant to the bridge:');
    for (const m of ticketMutations) console.log(`    ${m.name}${args(m.args)}: ${typeRef(m.type)}`);
  }

  step('3. Fetching menu: {getProducts{id name price}}...');
  const {getProducts: products} = await client.graphql('{getProducts{id name price}}');
  if (!products?.length) console.log('  (no products returned)');
  else {
    const width = Math.max(...products.map(p => String(p.name).length));
    for (const p of products) console.log(`    #${String(p.id).padEnd(5)} ${String(p.name).padEnd(width)}  ${p.price}`);
    ok(`${products.length} products`);
  }

  if (client.usedLenientParser) console.log('\nNote: the server sent malformed HTTP; the lenient parser (insecureHTTPParser) was needed.');
  console.log('\nAll checks passed. No tickets were created.');
}

main().catch(e => {
  if (e instanceof SambaError) {
    const label = {config: 'CONFIG ERROR', connection: 'CONNECTION ERROR', auth: 'AUTH ERROR', http: 'HTTP ERROR', graphql: 'GRAPHQL ERROR'}[e.kind];
    console.error(`\n${label}: ${e.message}`);
    if (e.kind === 'auth') console.error('  Check SAMBA_USER / SAMBA_PASSWORD / SAMBA_CLIENT_ID, and that the client id exists in SambaPOS.');
    if (e.kind === 'config') console.error('  Copy .env.example to .env and fill it in.');
  } else {
    console.error('\nUNEXPECTED ERROR:', e);
  }
  process.exit(1);
});
