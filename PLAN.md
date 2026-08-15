# Plan: FastMCP Server + React Client App (with per-tool auth)

## Goal

Build a simple MCP (Model Context Protocol) app in this repo:

- **Server**: Python, built with **FastMCP** (v3.4.7, already installed in `.venv`), exposing example tools over **Streamable HTTP** transport.
- **Auth**: Bearer-token auth with a **username/password login**; **some tools are admin-only** (hidden from `tools/list` and denied on `tools/call` without an admin token). Implemented with FastMCP's built-in auth framework (`TokenVerifier` + `require_scopes`).
- **Client**: **React + Vite + TypeScript**, UI with **Chakra UI**, server-state with **TanStack Query**, talking to the server via the official **MCP TypeScript SDK** (`@modelcontextprotocol/sdk`).

## Architecture

```
┌────────────────────────┐   POST /login (user+pass → token)   ┌─────────────────────────┐
│  client/ (React app)   │ ──────────────────────────────────▶ │  server/ (FastMCP app)  │
│  Chakra UI + TanStack  │                                     │  uvicorn :8000          │
└────────────────────────┘                                     └─────────────────────────┘
        │   Authorization: Bearer <token>
        │   initialize / tools/list / tools/call (Streamable HTTP)
        └─────────────────────────────────────────────────────▶   /mcp (BearerAuthBackend)
```

### Auth model (resource server)
- FastMCP ships `AuthProvider`/`TokenVerifier` + per-component auth checks (`require_scopes`, `restrict_tag`, custom callables) and an `AuthMiddleware` that **filters `tools/list` and enforces `tools/call`** over HTTP (auth is skipped for STDIO).
- We implement a `SimpleTokenVerifier(TokenVerifier)`:
  - `verify_token(token)` — validates an **HMAC-signed token** (stdlib `hmac`/`hashlib`, secret from env `MCP_SECRET_KEY`) and returns an `AccessToken` carrying `scopes` + expiry.
  - `get_routes()` — adds **`POST /login`** which validates `username`/`password` (env `MCP_USERNAME`/`MCP_PASSWORD`) and mints an admin-scoped token.
- Protected tools use `@mcp.tool(auth=require_scopes("admin"))` — simple, declarative, and `tools/list` automatically hides them from unauthenticated clients.

### Data flow
1. Client mounts → TanStack Query `useQuery` → MCP `Client.initialize()` → `listTools()` (public tools always; admin tools appear after login, since the server filters the list).
2. User fills a tool form generated from the tool's JSON input schema → `useMutation` → `callTool()` → result rendered as pretty JSON.
3. Auth state is a TanStack Query key — logging in/out invalidates and refetches the tool list.

## Repo layout

```
fastmcp-test/
├── PLAN.md
├── README.md
├── .env.example            # MCP_USERNAME, MCP_PASSWORD, MCP_SECRET_KEY
├── main.py                 # FastMCP server entrypoint
├── auth.py                 # SimpleTokenVerifier + /login route + HMAC token mint/verify
├── pyproject.toml
└── client/                 # Vite + React + TS app
    ├── package.json
    ├── vite.config.ts      # dev proxy /mcp + /login → localhost:8000
    ├── index.html
    └── src/
        ├── main.tsx                    # ChakraProvider + QueryClientProvider
        ├── App.tsx                     # Layout: sidebar (tools) + main (tool detail)
        ├── mcp/
        │   ├── auth.ts                 # login/logout, token storage, getAuthToken()
        │   └── client.ts               # MCP client singleton + transport w/ Bearer header
        ├── hooks/
        │   ├── useMcpTools.ts          # useQuery: listTools() (key includes auth state)
        │   ├── useMcpCall.ts           # useMutation: callTool()
        │   └── useLogin.ts             # useMutation: POST /login
        └── components/
            ├── LoginPanel.tsx          # username/password form + auth badge
            ├── ConnectionStatus.tsx
            ├── ToolsList.tsx
            ├── ToolCard.tsx            # schema-driven form
            └── ResultView.tsx          # pretty-printed tool result
```

## Step 1 — Server (FastMCP)

- `auth.py`:
  - `SimpleTokenVerifier(TokenVerifier)` — HMAC token mint/verify (claims: `sub`, `scopes`, `exp`, HMAC over payload), `verify_token()` → `AccessToken`, `get_routes()` → `POST /login`.
  - `POST /login` accepts `{username, password}` (or HTTP Basic) → 200 `{access_token}` | 401.
- `main.py`:
  - Tools:
    - `add(a: float, b: float) -> float` — **public**
    - `reverse_string(text: str) -> str` — **public**
    - `get_time(timezone: str | None = None) -> str` — **admin** (`@mcp.tool(auth=require_scopes("admin"))`)
    - `secret_message() -> str` — **admin**, returns a secret string
  - `app = create_streamable_http_app(mcp, "/mcp", auth=SimpleTokenVerifier(...), allowed_origins=["http://localhost:5173"])`
  - Run via `uvicorn main:app --port 8000` (uvicorn 0.52.3 already in venv).
- Verify with curl:
  - `curl -X POST :8000/login` with bad creds → 401; good creds → token.
  - `curl -N :8000/mcp` without token → 401; `tools/list` with token → only public tools; with admin token → all 4 tools; `tools/call` on `secret_message` without admin token → AuthorizationError.

## Step 2 — Client scaffold

- `npm create vite@latest client -- --template react-ts`
- Deps: `@chakra-ui/react @emotion/react @emotion/styled framer-motion`, `@tanstack/react-query`, `@modelcontextprotocol/sdk`
- `main.tsx`: `ChakraProvider` + `QueryClientProvider`.
- Vite proxy: `/mcp` and `/login` → `http://localhost:8000` (avoids CORS friction; server CORS still configured as backup).

## Step 3 — MCP connection + auth layer

- `mcp/auth.ts`: `login(username, password)` → POST `/login`, store token (in-memory; optionally localStorage), `getAuthToken()`, `logout()`, `isAuthenticated()`.
- `mcp/client.ts`: lazy `new Client({ name: "fastmcp-client", version: "0.1.0" })` + `new StreamableHTTPClientTransport(new URL("/mcp"), { requestInit: () => ({ headers: { Authorization: `Bearer ${getAuthToken()}` } }) })` — token header sent on every request including the SSE stream; expose typed `listTools()` / `callTool()`; guard double-init; surface connection errors.

## Step 4 — Hooks (TanStack Query)

- `useMcpTools`: `useQuery({ queryKey: ["mcp", "tools", isAuthenticated()], queryFn: listTools, staleTime })` — refetches on auth change.
- `useMcpCall(toolName)`: `useMutation` → result per-tool; `isPending` drives button state; errors (401/AuthorizationError) surfaced as auth messages.
- `useLogin`: `useMutation` → on success: store token + `queryClient.invalidateQueries(["mcp"])`.

## Step 5 — UI (Chakra UI)

- `LoginPanel`: email/password inputs, submit → `useLogin`; after login show username + Logout.
- `ConnectionStatus`: server up/down + auth state badge (Signed out / Signed in as admin).
- `ToolsList`: card grid of tools from `useMcpTools`; empty state with "Log in as admin to see admin tools" hint when signed out.
- `ToolCard`: form fields from `inputSchema.properties` (text/number/boolean) → submit → `useMcpCall`; show a lock icon + admin badge for admin tools.
- `ResultView`: `structuredContent` / `content[0].text` pretty-printed in a `<Code>` block.

## Step 6 — Run & verify

- Terminal 1: `uvicorn main:app --port 8000`
- Terminal 2: `cd client && npm run dev` → http://localhost:5173
- Verify: public tools callable signed-out; `secret_message`/`get_time` hidden and denied signed-out; after `admin/secret` login they appear and run; bad creds → 401 toast.

## Out of scope (for now)

- Full OAuth 2.1/OIDC flows (FastMCP supports `OAuthProvider`, Clerk, Supabase, etc. — drop-in later)
- MCP resources & prompts (tools only for the demo)
- Streaming tool-call progress in the UI
- Token refresh / revocation, HTTPS
