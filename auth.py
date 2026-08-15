"""Simple bearer-token auth for the FastMCP server.

Flow:
  POST /login  {username, password}  ->  {access_token, token_type, expires_in}

Credentials come from the MCP_USERS env var, one user per entry, in the form
"username:password:scope1,scope2" (scopes default to ["admin"]):

    MCP_USERS=admin:secret:admin,alice:wonder:user

The token is an HS256 JWT (signed with MCP_SECRET_KEY) carrying:
  {"sub": username, "scopes": [...], "iat": ..., "exp": ...}

SimpleTokenVerifier verifies the JWT and returns an AccessToken whose
``scopes`` drive FastMCP's per-tool checks (e.g. require_scopes("admin")).

Note: the MCP endpoint itself requires a valid bearer token (any scope) to
connect, so clients log in before initializing. Per-tool checks then hide
tools the user's scopes do not allow (tools/list is filtered server-side).
"""

from __future__ import annotations

import os
import time
from typing import Any

from joserfc import jwk, jwt
from joserfc.errors import JoseError
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from fastmcp.server.auth import AccessToken, TokenVerifier

TOKEN_TTL_SECONDS = 3600  # 1 hour


def _secret_key() -> bytes:
    secret = os.environ.get("MCP_SECRET_KEY", "")
    if not secret:
        raise RuntimeError(
            "MCP_SECRET_KEY environment variable is required to run the server"
        )
    return secret.encode()


def _key() -> Any:
    return jwk.import_key(_secret_key(), "oct")


def _users() -> dict[str, tuple[str, list[str]]]:
    """Parse MCP_USERS env var into {username: (password, scopes)}.

    Format per entry: "username:password:scope1,scope2". Scopes default to
    ["admin"] when the third field is omitted.
    """
    raw = os.environ.get("MCP_USERS", "admin:secret")
    users: dict[str, tuple[str, list[str]]] = {}
    for entry in raw.split(","):
        entry = entry.strip()
        if not entry or ":" not in entry:
            continue
        parts = [p.strip() for p in entry.split(":")]
        username = parts[0]
        password = parts[1] if len(parts) > 1 else ""
        scopes = [s for s in parts[2].split(",") if s] if len(parts) > 2 else ["admin"]
        users[username] = (password, scopes)
    return users


def mint_token(username: str, scopes: list[str]) -> str:
    """Mint an HS256 JWT for the given user and scopes."""
    now = int(time.time())
    claims = {
        "sub": username,
        "scopes": scopes,
        "iat": now,
        "exp": now + TOKEN_TTL_SECONDS,
    }
    return jwt.encode({"alg": "HS256", "typ": "JWT"}, claims, _key())


async def login(request: Request) -> JSONResponse:
    """POST /login — exchange username/password for a bearer token."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid_request"}, status_code=400)

    username = str(body.get("username", ""))
    password = str(body.get("password", ""))

    user = _users().get(username)
    if user is None or password != user[0]:
        return JSONResponse(
            {"error": "invalid_credentials"}, status_code=401
        )

    token = mint_token(username, user[1])
    return JSONResponse(
        {
            "access_token": token,
            "token_type": "bearer",
            "expires_in": TOKEN_TTL_SECONDS,
        }
    )


class SimpleTokenVerifier(TokenVerifier):
    """Verifies the HS256 JWTs minted by POST /login."""

    async def verify_token(self, token: str) -> AccessToken | None:
        try:
            decoded = jwt.decode(token, _key())
        except JoseError:
            return None

        claims = decoded.claims
        if not isinstance(claims, dict):
            return None

        # joserfc does not enforce exp by default — check it explicitly.
        exp = claims.get("exp")
        if exp is not None and int(time.time()) >= int(exp):
            return None

        scopes = claims.get("scopes") or []
        if not isinstance(scopes, list):
            return None

        return AccessToken(
            token=token,
            client_id="browser-client",
            scopes=[str(s) for s in scopes],
            expires_at=int(exp) if exp is not None else None,
            subject=str(claims.get("sub")) if claims.get("sub") else None,
            claims=dict(claims),
        )

    def get_routes(self, mcp_path: str | None = None) -> list[Route]:
        """Mount POST /login alongside the MCP endpoint."""
        return [Route("/login", login, methods=["POST"])]
