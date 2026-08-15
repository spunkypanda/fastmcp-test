"""FastMCP server with two public tools and two admin-only tools.

Run:
    MCP_SECRET_KEY=dev-secret uvicorn main:app --port 8000

Endpoints:
    POST /login  ->  {access_token, ...}   (username/password from MCP_USERS)
    POST /mcp    ->  Streamable HTTP MCP endpoint (bearer-token protected)
"""

from datetime import datetime, timezone
from typing import Annotated, Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from faker import Faker
from fastmcp import FastMCP
from fastmcp.server.auth import require_scopes
from fastmcp.server.http import create_streamable_http_app
from pydantic import Field

from auth import SimpleTokenVerifier

mcp = FastMCP("simple-server")

# Seeded so the sample customer records are stable across calls.
_fake = Faker()
_fake.seed_instance(42)


@mcp.tool()
def add(a: float, b: float) -> float:
    """Add two numbers together."""
    return a + b


@mcp.tool()
def reverse_string(text: str) -> str:
    """Reverse the characters of a string."""
    return text[::-1]


@mcp.tool(auth=require_scopes("admin"))
def get_time(timezone_name: str | None = None) -> str:
    """Get the current time, optionally in a given IANA timezone (admin only)."""
    if timezone_name:
        try:
            tz = ZoneInfo(timezone_name)
        except ZoneInfoNotFoundError:
            return f"Unknown timezone: {timezone_name}"
    else:
        tz = timezone.utc
    return datetime.now(tz).isoformat()


@mcp.tool(auth=require_scopes("admin"))
def secret_message() -> str:
    """Return a secret message (admin only)."""
    return "The cake is a lie. Admin tools work!"


@mcp.tool(auth=require_scopes("admin"))
def get_customers(
    count: Annotated[int, Field(ge=1, le=100)] = 10,
) -> list[dict[str, Any]]:
    """Return `count` sample customer records generated with Faker (admin only).

    Phone numbers are E.164-formatted (+1 country code); created_at is a
    human-readable date string.
    """
    customers: list[dict[str, Any]] = []
    for i in range(count):
        customers.append(
            {
                "id": i + 1,
                "name": _fake.name(),
                "email": _fake.email(),
                "phone": _e164_phone(),
                "company": _fake.company(),
                "city": _fake.city(),
                "country": _fake.country(),
                "created_at": _human_readable_date(),
            }
        )
    return customers


def _e164_phone() -> str:
    """A valid E.164 number: +91 (India) + a 10-digit mobile number (starts 6-9)."""
    leading = _fake.random_int(min=6, max=9)
    rest = _fake.random_number(digits=9, fix_len=True)
    return f"+91{leading}{rest}"


def _human_readable_date() -> str:
    """e.g. 'Apr 25, 2021 at 09:45 PM'."""
    return _fake.date_time_this_decade().strftime("%b %d, %Y at %I:%M %p")


app = create_streamable_http_app(
    mcp,
    "/mcp",
    auth=SimpleTokenVerifier(base_url="http://localhost:8000"),
    allowed_origins=["http://localhost:5173"],
)


if __name__ == "__main__":
    # STDIO transport (auth checks are skipped on stdio, so all tools are
    # available to e.g. Claude Desktop or the pytest stdio client).
    mcp.run()
