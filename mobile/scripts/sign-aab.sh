#!/bin/bash
# Signs an Android App Bundle with the Play upload key, reading the password from
# ~/punchbook-keys/punchbook-pickup-upload.properties (never printed).
# Usage: mobile/scripts/sign-aab.sh <input.aab> <output.aab>
set -euo pipefail
IN="${1:?input .aab}"; OUT="${2:?output .aab}"
KEYS="$HOME/punchbook-keys"
PROPS="$KEYS/punchbook-pickup-upload.properties"
[ -f "$PROPS" ] || { echo "Missing $PROPS"; exit 1; }
# First matching key (case-insensitive, any of the given names); value only, never printed.
prop() { local n; for n in "$@"; do grep -iE "^[[:space:]]*([A-Za-z0-9_.]*[._])?$n[[:space:]]*[=:]" "$PROPS" | head -1 | sed -E 's/^[^=:]*[=:][[:space:]]*//' | tr -d '\r' && return 0; done; return 0; }

echo "Keys in $(basename "$PROPS"): $(grep -oE '^[[:space:]]*[A-Za-z0-9_.]+' "$PROPS" | tr -d ' ' | tr '\n' ' ')"
STORE_FILE="$(prop storeFile STORE_FILE keystore)"; STORE_FILE="${STORE_FILE:-$KEYS/punchbook-pickup-upload.jks}"
[[ "$STORE_FILE" = /* ]] || STORE_FILE="$KEYS/$(basename "$STORE_FILE")"
export PB_STORE_PASS="$(prop storePassword STORE_PASSWORD storePass keystorePassword password)"
export PB_KEY_PASS="$(prop keyPassword KEY_PASSWORD keyPass)"; PB_KEY_PASS="${PB_KEY_PASS:-$PB_STORE_PASS}"
ALIAS="$(prop keyAlias KEY_ALIAS alias)"
[ -n "$PB_STORE_PASS" ] || { echo "Couldn't find a store password among those keys. Tell Claude the key names above."; exit 1; }
[ -n "$ALIAS" ] || ALIAS="$(keytool -list -keystore "$STORE_FILE" -storepass:env PB_STORE_PASS | awk -F, '/PrivateKeyEntry/{print $1; exit}')"

TMP="$(mktemp -d)/unsigned.aab"
cp "$IN" "$TMP"
zip -q -d "$TMP" 'META-INF/*.SF' 'META-INF/*.RSA' 'META-INF/*.MF' >/dev/null 2>&1 || true
jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore "$STORE_FILE" \
  -storepass:env PB_STORE_PASS -keypass:env PB_KEY_PASS -signedjar "$OUT" "$TMP" "$ALIAS" | grep -v "^jar signed" || true
echo "Signed: $OUT"
keytool -printcert -jarfile "$OUT" | grep -m1 SHA1
