# Punchbook Restaurant Prototype

A mobile-first QR restaurant ordering prototype for Sri Lanka.

Flow: table QR → menu → cart → checkout → Card or JustPay → order status → restaurant dashboard.

## Run

```bash
npm install
cp .env.example .env
npm start
```

Open:
- Merchant homepage: http://localhost:3000/
- Customer menu: http://localhost:3000/peppermint
- Table-specific menu: http://localhost:3000/peppermint/t/12
- Existing `/r/peppermint/t/12` QR links remain supported.
- Restaurant dashboard: http://localhost:3000/admin
- QR poster: http://localhost:3000/qr?table=12
- Pickup order board (for the Android app in `mobile/`): http://localhost:3000/pickup-admin
- POS bridge test console (Square): http://localhost:3000/pos

## Payments

### Card
By default card payment is simulated so the prototype works immediately.

To try the OnePay hosted checkout adapter, set the following environment variables and restart:

```bash
ONEPAY_APP_ID=...
ONEPAY_HASH_SALT=...
ONEPAY_APP_TOKEN=...
SIMULATE_CARD=false
PUBLIC_BASE_URL=https://your-public-https-domain.example
```

The server generates the required SHA-256 hash and POSTs to OnePay's documented `POST /v3/checkout/link/` endpoint. Keep the hash salt server-side.

**Important:** OnePay's redirect URL must be HTTPS, so a localhost-only deployment cannot complete a real hosted gateway redirect. Use an HTTPS tunnel or deploy the prototype.

### JustPay
The JustPay flow is intentionally simulated because a public DirectPay/OnePay merchant API contract for initiating JustPay was not available in the documentation used to build this prototype. The app isolates this behind a payment adapter so it can be replaced once merchant sandbox/API credentials and the provider contract are supplied.

## POS integration (Square)

`pos-square.js` connects Punchbook to Square's free Sandbox. Open `/pos` to test it.

- When a Punchbook order is paid, it is created in Square as a PICKUP order (dine-in orders show as "Table N · dine-in"). An EXTERNAL payment is recorded on it, so it appears in the Square Dashboard.
- "Sync menu" upserts the linked restaurant's menu as Square catalog items, so order lines map to real POS items.
- Status changes in Punchbook (preparing → ready/served → collected) step the Square fulfillment through PROPOSED → RESERVED → PREPARED → COMPLETED.
- Changes made in Square flow back by webhook (`POST /api/pos/square/webhook`, needs `SQUARE_WEBHOOK_SIGNATURE_KEY` and a public HTTPS URL), or by polling every 10s otherwise.
- Square has no LKR, so prices are converted at `SQUARE_LKR_PER_UNIT` (default 300).

Setup: create a free account at developer.squareup.com, create an app, copy its **Sandbox** access token into `SQUARE_ACCESS_TOKEN`, and restart. To see orders, open Developer Console → Sandbox test accounts → Open in Square Dashboard → Orders.

## Prototype notes
- In-memory orders reset when the server restarts.
- No production authentication.
- No production database.
- No real funds are moved by the simulated payment flows.
