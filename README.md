# Riftbound Deck Comparator

A self-hosted web app for comparing two Riftbound decks side by side and seeing the card differences graphically. Each deck can be supplied as a pasted text list, a Piltover Archive deck code, or a decklist URL. Comparison is printing-independent: alternate art, signed, and base printings of the same card collapse to a single identity, so differences reflect actual card composition rather than cosmetic variation. Comparisons can be shared as a self-contained link that reconstructs the exact view.

## Features

- Compare two decks supplied by any mix of text list, deck code, or link
- Text lists accept card codes or plain card names, and the diff is grouped by deck section (Legend, Chosen Champion, Battlefields, Main Deck, Runes, Sideboard)
- Printing-independent normalization (variants like `OGN-007a` and `OGN-007` are treated as the same card)
- Graphical diff showing every card difference with per-deck quantities, plus a clear "no differences" state
- Name each deck, or inherit a name from a source link
- Shareable links that encode the full comparison in the URL fragment (no server storage)
- Stateless, single-process server designed to run in an LXC container on Proxmox

## Text deck list format

The **text list** input accepts one card per line, in any of these forms:

```
3 OGN-007a                     # <quantity> <card code>
3x Traveling Merchant          # <quantity>x <card name>
3 Traveling Merchant           # <quantity> <card name>
1 Kennen, Heart of the Tempest # names may contain spaces and commas
```

Quantities are integers from 1 to 99. Lines referencing the same card are summed (capped at 99). Blank lines are ignored. **Section headers** — a label ending in `:` — set the section for the cards that follow, and the comparison is displayed grouped by section. Header variants map to canonical labels: `Legend`, `Chosen Champion` (from `Champion`), `Battlefields`, `Main Deck` (from `MainDeck`), `Runes` (from `Rune Pool`), and `Sideboard`. Cards before any header, or under an unrecognized header, fall into `Main Deck`. A full exported decklist pastes in cleanly:

```
Legend:
1 Kennen, Heart of the Tempest
MainDeck:
3 Traveling Merchant
2 Fizz, Trickster
Rune Pool:
9 Chaos Rune
```

A line that has no leading quantity (and isn't a section header) is rejected, and the parser reports the offending line number.

**Matching note:** cards match across the two decks by exact identifier — normalized card code, or verbatim card name. Comparing two name-based lists works well, and comparing two code-based decks (or deck codes) works well. Comparing a *name* list against a *code* deck will not match cards, because the app has no card database to translate names to codes.

## Architecture

The project is a TypeScript monorepo (npm workspaces) split into three packages:

| Package | Role |
| --- | --- |
| `shared` | Pure domain logic: text parser, deck-code decoder, normalizer, comparison engine, share-link service, and the Comparator orchestrator. Runs primarily in the browser. |
| `client` | React + Vite UI: deck input/naming, the graphical comparison view, and the client half of the link importer. Builds to a static bundle. |
| `server` | Thin Node/Fastify process: serves the built client bundle and exposes a single `/api/import` proxy endpoint. |

All three input methods converge on a common structured-deck shape, which is normalized (stripping printing variants) before the comparison engine diffs the two decks. The server is stateless — the only non-static responsibility is proxying link imports, which need a server-side fetch to avoid browser CORS restrictions and to enforce a 30-second timeout.

Key technologies: TypeScript, React 18 + Vite, Fastify 5, and Vitest + fast-check for testing. Deck codes are handled by the official [`@piltoverarchive/riftbound-deck-codes`](https://github.com/Piltover-Archive/RiftboundDeckCodes) library.

## Getting started

Requires Node.js 20+ and npm.

```bash
npm install        # install all workspaces
npm run build      # build shared -> client -> server
```

The build produces the static client bundle at `client/dist` and the server entry point at `server/dist/index.js`.

### Development

Run the client dev server (Vite, with hot reload):

```bash
npm run dev --workspace @riftbound/client
```

The Vite dev config proxies `/api` to the server, so run the server alongside it in a separate terminal:

```bash
npm run build --workspace @riftbound/server
node server/dist/index.js
```

### Running the production server

After `npm run build`:

```bash
node server/dist/index.js
```

The server listens on `0.0.0.0:3000` by default and serves the client bundle plus the `/api/import` endpoint.

#### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port the server listens on |
| `HOST` | `0.0.0.0` | Interface to bind (use `127.0.0.1` when fronted by a local tunnel) |
| `CLIENT_DIST` | `../../client/dist` (relative to `server/dist/index.js`) | Location of the built client bundle, if the deployed layout differs from the repo |

## Testing

The test suite combines property-based tests (fast-check, one test per correctness property, minimum 100 iterations each) with unit, edge-case, and integration tests.

```bash
# Shared domain logic + server (Node environment)
npx vitest run shared/src server/src

# Client component/integration tests (jsdom environment)
cd client && npx vitest run --config vitest.config.ts
```

## API

### `POST /api/import` (also `GET /api/import?url=…`)

Proxies a decklist retrieval from a supported source.

- **Request:** JSON body `{ "url": "https://…" }` (POST) or a `url` query parameter (GET).
- **Success (200):**
  ```json
  { "deck": [["OGN-007a", 3], ["VEN-SP1", 1]], "sourceName": "My Deck" }
  ```
  `deck` is an array of `[cardCode, quantity]` entries (a `Map` does not survive JSON); reconstruct it with `new Map(deck)`. `sourceName` is present only when the source supplies one.
- **Errors:** `{ "error": { "code": string, "message": string, "inputMethod": "link" } }`
  - `400` — missing or malformed URL / non-http(s) scheme
  - `415` — well-formed URL but no supported source adapter
  - `502` — retrieval failed, or the content had no parseable cards
  - `504` — retrieval exceeded the 30-second timeout

Share links are handled entirely client-side and are never sent to the server; the full comparison state lives in the URL fragment (`#c=…`).

## Deployment (Proxmox LXC + Cloudflare Tunnel)

The server is a single stateless Node process, so it runs well in a small unprivileged LXC container. Cloudflared tunnels public traffic to the local port, so no inbound firewall ports are needed on the container or your router.

### 1. Create the container

From the Proxmox host:

```bash
pveam update

# Find the exact current template name (the version suffix changes over time)
pveam available --section system | grep debian-12
# Download the name from the list above, e.g.:
TEMPLATE=debian-12-standard_12.12-1_amd64.tar.zst
pveam download local "$TEMPLATE"

pct create 120 "local:vztmpl/$TEMPLATE" \
  --hostname riftbound \
  --cores 1 --memory 512 --swap 512 \
  --rootfs local-lvm:4 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 --features nesting=1 --onboot 1

pct start 120
pct enter 120
```

Set `TEMPLATE` to the exact filename shown by `pveam available`, since the point-release version changes over time.

### 2. Install Node and build (inside the container)

```bash
apt update && apt install -y curl git ca-certificates
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

git clone <your-repo-url> /opt/riftbound
cd /opt/riftbound
npm install
npm run build
```

### 3. Run the server as a systemd service

```bash
useradd --system --home /opt/riftbound --shell /usr/sbin/nologin riftbound
chown -R riftbound:riftbound /opt/riftbound
```

`/etc/systemd/system/riftbound.service`:

```ini
[Unit]
Description=Riftbound Deck Comparator
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=riftbound
WorkingDirectory=/opt/riftbound
ExecStart=/usr/bin/node /opt/riftbound/server/dist/index.js
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOST=127.0.0.1
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Binding to `127.0.0.1` keeps the app reachable only through the tunnel. Then:

```bash
systemctl daemon-reload
systemctl enable --now riftbound
```

### 4. Install and configure cloudflared

```bash
mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared bookworm main" \
  | tee /etc/apt/sources.list.d/cloudflared.list
apt update && apt install -y cloudflared

cloudflared tunnel login
cloudflared tunnel create riftbound
cloudflared tunnel route dns riftbound zauniteworkshop.com
```

`/etc/cloudflared/config.yml`:

```yaml
tunnel: riftbound
credentials-file: /root/.cloudflared/<TUNNEL-ID>.json

ingress:
  - hostname: zauniteworkshop.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

The trailing `http_status:404` catch-all is required — cloudflared will not start without a terminating ingress rule.

### 5. Run cloudflared as a service

```bash
cloudflared service install
systemctl enable --now cloudflared
```

`https://riftbound.yourdomain.com` now serves the app over Cloudflare's edge with automatic TLS.

### Updating

```bash
cd /opt/riftbound && git pull && npm install && npm run build
systemctl restart riftbound
```

### Notes

- The `/api/import` proxy makes outbound HTTPS calls to third-party decklist sources, so the container needs internet egress (the default). Cloudflared also needs outbound 443; neither requires inbound ports.
- If you create the tunnel from the Cloudflare Zero Trust dashboard instead of the CLI, you can skip `config.yml` and install with a token: `cloudflared service install <TOKEN>`.

## Security / dependency notes

### Node and npm versions

This project targets **Node.js 20 LTS**, which ships with **npm 10** — this pairing is correct and expected. If `npm` prints a notice about a new major version (e.g. npm 12), you can ignore it: npm 12 requires Node 22/24/26 and will refuse to install on Node 20 with an `EBADENGINE` / `notsup` error. Don't chase the npm upgrade to silence the notice. If you genuinely want a newer npm, upgrade Node first (e.g. the NodeSource `setup_22.x` script), but it is not required here.

### `npm audit` findings

`npm install` may report vulnerabilities. Before acting on them:

- **Do not run `npm audit fix --force`.** The `--force` flag installs breaking major-version changes across dependencies and can silently break the build or runtime.
- **Check what actually ships in production.** Most findings are in build/test tooling (Vite, Vitest, test libraries) that never runs in the container. The deployed server runtime is only `fastify`, `@fastify/static`, `@piltoverarchive/riftbound-deck-codes`, and `fflate`.

```bash
npm audit              # full report, including dev/build tooling
npm audit --omit=dev   # only the production runtime tree
```

If `npm audit --omit=dev` reports **0 vulnerabilities**, the deployed process is unaffected and the findings can be left alone. If there *are* runtime advisories, address them narrowly and re-verify:

```bash
npm audit fix                       # semver-compatible fixes only (no --force)
# or bump a specific package deliberately:
npm install <pkg>@<safe-version>

npm run build
npx vitest run shared/src server/src
```

Always confirm the build and tests still pass after any dependency change — that's the safety step `--force` skips.

## License

See repository license.
