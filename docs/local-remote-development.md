# Local–Remote Backend Development

Penumbra keeps browser requests same-origin during local development. The browser talks only to the local Vite server; Vite forwards the confirmed AionHome routes to the configured remote HTTPS/WSS origin. This keeps the backend origin out of React runtime configuration and lets HTTP and WebSocket requests use the same localhost session cookie.

## Configure the target

Copy the placeholder from `.env.example` into a local, ignored `.env.local`:

```env
PENUMBRA_DEV_PROXY_TARGET=https://your-aionhome-host.example
```

The value is read only by `vite.config.ts`. It deliberately has no `VITE_` prefix, so Vite does not expose it through `import.meta.env` to the browser bundle. The value must be an `http:` or `https:` origin without credentials, a path, query parameters, or a fragment. A trailing slash is allowed and normalized away.

Never commit `.env.local`, a real remote host, Cookie, Token, Authorization value, or credentials in a URL. Production builds do not read or require this variable. With no target, the development server keeps its previous no-proxy behavior.

## Start Penumbra

```bash
npm run dev
```

The default development origin is `http://localhost:3000`. Browser-side runtime configuration remains empty/same-origin, so requests resolve as:

```text
GET http://localhost:3000/api/session
GET http://localhost:3000/api/conversations
WS  ws://localhost:3000/ws
```

Vite forwards these confirmed paths without rewriting their bodies:

- `/api` — all AionHome HTTP APIs, including `/api/upload` and future SSE responses;
- `/ws` — the browser session WebSocket endpoint, with Upgrade enabled;
- `/uploads` — public attachment URLs returned by `POST /api/upload`.

`/ws/android-push` is not used by Penumbra and no push token is added. `/files` is not proxied because AionHome exposes file management below `/api/files`; no unverified static path is configured.

## Session cookie

AionHome establishes a session through `POST /api/auth/login`. Its `aion_session` cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, and host-only because the response does not set `Domain`. The Vite proxy therefore does not rewrite Cookie domain or path and never exposes Cookie content to JavaScript.

The backend marks the Cookie `Secure` when it sees an HTTPS request. Some browser configurations may not persist or send a Secure Cookie from an HTTP localhost page. Verify the actual Cookie behavior in the browser; do not remove `Secure` in the proxy. If the localhost exception is not sufficient, run Vite behind a trusted local HTTPS certificate and use `https://localhost:3000` / `wss://localhost:3000`. Session establishment still uses the real AionHome login contract; this bridge does not add a login UI or copy a Cookie from the remote host.

## Read-only verification

After establishing a localhost session, check in this order:

1. `GET /api/session`;
2. `GET /api/models`;
3. `GET /api/chat/readiness`;
4. `GET /api/conversations`;
5. select one returned conversation ID and call `GET /api/conversations/{id}/messages`;
6. open `ws://localhost:3000/ws` without sending commands.

The browser Network panel must show only localhost request URLs. HTTP 401 and WebSocket close code 1008 are valid unauthenticated AionHome results, not proxy failures. Do not send chat messages, regenerate requests, WebSocket `ping`/`tts_state`, or provider probes as part of this check.

Use the existing Settings page to verify session, models, readiness, loading/error/retry states, and console cleanliness. Conversation and history verification should use the existing domain/application read layers until the Chat Read-Only UI integration is implemented.

## Cloudflare and SSH fallback

The default bridge targets the deployed Cloudflare HTTPS/WSS origin. [Cloudflare supports proxied WebSocket connections](https://developers.cloudflare.com/network/websockets/), but route, WAF, tunnel, Cookie, SSE buffering, and idle-timeout behavior must be diagnosed against the actual deployment.

If Cloudflare routing is unsuitable for local login or WebSocket/SSE development, create an SSH tunnel manually:

```bash
ssh -N \
  -L 18080:127.0.0.1:8080 \
  ubuntu@<server>
```

Then use this local-only setting:

```env
PENUMBRA_DEV_PROXY_TARGET=http://127.0.0.1:18080
```

No SSH host, key, or automation belongs in this repository.
