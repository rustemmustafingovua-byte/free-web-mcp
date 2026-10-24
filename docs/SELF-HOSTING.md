# Self-Hosting `free-web-mcp` with a Public URL in 10 Minutes

`free-web-mcp` includes a built-in Streamable HTTP MCP server (`free-web-mcp serve --port 8788`) and built-in **x402** payment verification on Base (`--price <usd>` / `X402_PRICE_USD`). This guide walks through running it locally or via Docker, keeping it alive with `systemd`, exposing a public HTTPS URL via a tunnel or reverse proxy, and charging per call with `x402`.

---

## 1. Run in HTTP Mode Locally or with `docker run`

### Node CLI

```bash
npx -y free-web-mcp serve --port 8788
# [free-web-mcp] http server on :8788 (mcp at /mcp, price 0 USDC/call)
```

### `docker run` Example

Build and run `free-web-mcp` in a container:

```bash
docker build -t free-web-mcp .
docker run -d \
  --name free-web-mcp \
  --restart unless-stopped \
  -p 127.0.0.1:8788:8788 \
  -e X402_PAY_TO=0xYourBaseWalletAddress \
  -e X402_PRICE_USD=0.002 \
  free-web-mcp
```

Verify the health endpoint:

```bash
curl -s http://127.0.0.1:8788/health
# {"ok":true,"price":0.002,"freeTierPerHour":10,"paidPath":"/mcp/paid",...}
```

---

## 2. Keep It Running with a `systemd` Unit

Create `/etc/systemd/system/free-web-mcp.service`:

```ini
[Unit]
Description=free-web-mcp Streamable HTTP MCP Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/free-web-mcp
Environment=NODE_ENV=production
Environment=X402_PAY_TO=0xYourBaseWalletAddress
Environment=X402_PRICE_USD=0.002
ExecStart=/usr/bin/node /opt/free-web-mcp/bin/free-web-mcp.js serve --port 8788 --price 0.002
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now free-web-mcp
sudo systemctl status free-web-mcp
```

---

## 3. Expose a Public URL (Tunnel or Reverse Proxy)

### Option A: Instant Public URL with a Tunnel (No Firewall / Router Changes)

**Cloudflare Quick Tunnel (`cloudflared`):**

```bash
cloudflared tunnel --url http://127.0.0.1:8788
# Public MCP endpoint: https://<random-words>.trycloudflare.com/mcp
```

**ngrok:**

```bash
ngrok http 8788
# Public MCP endpoint: https://<id>.ngrok-free.app/mcp
```

### Option B: Reverse Proxy with Automatic TLS

**Caddy (`/etc/caddy/Caddyfile`):**

```caddyfile
mcp.example.com {
    reverse_proxy 127.0.0.1:8788 {
        flush_interval -1
    }
}
```

**Nginx (`/etc/nginx/sites-available/free-web-mcp.conf`):**

```nginx
server {
    listen 443 ssl http2;
    server_name mcp.example.com;

    ssl_certificate     /etc/letsencrypt/live/mcp.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8788;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 120s;
    }
}
```

Point any MCP client at your public URL:

```json
{
  "mcp": {
    "free-web": {
      "type": "remote",
      "url": "https://mcp.example.com/mcp"
    }
  }
}
```

---

## 4. `x402` Pricing: Charge Per Call on Base

`free-web-mcp` has native **HTTP `402 Payment Required` (`x402`)** support built into `src/x402.js` and `bin/free-web-mcp.js`.

### Enabling Per-Call Pricing

Pass `--price <usd>` (or set `X402_PRICE_USD`) and set your receiving wallet in `X402_PAY_TO`:

```bash
X402_PAY_TO=0xYourBaseWalletAddress \
free-web-mcp serve --port 8788 --price 0.002
```

### Endpoints & Free-Tier Quota

| Path | Behavior when `--price > 0` |
| --- | --- |
| `POST /mcp` | Allows `FREE_TIER_PER_HOUR` (10 requests/hour per IP) free, then returns `402 Payment Required` |
| `POST /mcp/paid` | Always requires payment (`x402`) on every call |
| `GET /health` | Returns `{ ok, price, freeTierPerHour, paidPath }` |

### Supported `x402` Payment Flows (Base Mainnet, Chain ID `8453`)

1. **Gasless for Server — Direct Transfer + Proof (`X-PAYMENT-TX`):**
   - The client sends either **USDC on Base** (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) or **native ETH on Base** worth at least `priceUsd` to `X402_PAY_TO` and retries the request with header `X-PAYMENT-TX: 0x<txHash>`.
   - `free-web-mcp` verifies the on-chain transaction via `BASE_RPC` (`https://mainnet.base.org`) with zero gas required on the server.
2. **EIP-3009 Signed Authorization (`PAYMENT-SIGNATURE` / `X-PAYMENT`):**
   - The client signs a `TransferWithAuthorization` payload for USDC on Base and sends it in the `PAYMENT-SIGNATURE` (or `X-PAYMENT`) header.
   - Set `X402_GAS_KEY=0x<privateKey>` if you want the server to automatically submit `transferWithAuthorization` on-chain via `collectPayment()`.
