# Punchbook → SambaPOS bridge

A small program that runs on the restaurant's POS computer. It fetches paid Punchbook orders,
creates them in SambaPOS V5 as kitchen tickets, and reports "Ready" back to Punchbook so
customers (and later drivers) are updated. Nothing on the restaurant network has to be opened
to the internet: the bridge only makes outgoing requests.

Needs Node 20.12+ and no `npm install` (there are no dependencies).

```sh
cd bridge
cp .env.example .env      # then fill it in
```

## Settings (`.env`)

| Setting | What it is |
| --- | --- |
| `SAMBA_URL`, `SAMBA_USER`, `SAMBA_PASSWORD`, `SAMBA_CLIENT_ID` | SambaPOS message server and API login |
| `PUNCHBOOK_URL` | Punchbook server, e.g. `https://punchbook.online` |
| `PUNCHBOOK_BRIDGE_KEY` | This restaurant's secret; must match `BRIDGE_KEYS` on the server (`amra:<secret>`) |

## Commands

- `npm run test-connection`: logs in to SambaPOS, saves the GraphQL schema to `schema/`, prints the menu.
  Creates no tickets.
- `npm run simulate`: a fake POS for testing the Punchbook side without SambaPOS. It "prints" each
  paid order as a ticket and presses Ready after 20 seconds (`SIMULATE_READY_AFTER` to change).

## SambaPOS notes

- The message server must run in GraphQL mode (port with a `+` in the service tool, e.g. `9000+`) and as
  administrator so other machines can connect.
- Unlicensed (trial) SambaPOS refuses API login over plain HTTP: `/Token` returns 404. A licensed copy is required.
- If the server sends malformed HTTP, the client retries with Node's lenient parser and says so.

## How it talks to Punchbook

See `pos-bridge.js` in the main app. With `Authorization: Bearer <key>`:

- `GET /api/bridge/orders`: paid orders not yet in the POS
- `POST /api/bridge/orders/:id/ack`: `{ticketId, ticketNumber}` on success, or `{error}`
- `POST /api/bridge/orders/:id/status`: `{orderStatus: "ready"}` when the kitchen marks it ready
