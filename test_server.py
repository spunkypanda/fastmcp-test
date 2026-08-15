"""Server tests using the MCP stdio client (auth checks are skipped on stdio)."""

import asyncio
import json
import re
import sys
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

SERVER = Path(__file__).resolve().parent / "main.py"

CUSTOMER_FIELDS = {
    "id",
    "name",
    "email",
    "phone",
    "company",
    "city",
    "country",
    "created_at",
}

# E.164: +<country code 1-3 digits><national number>, max 15 digits total.
E164_RE = re.compile(r"^\+[1-9]\d{1,14}$")

# e.g. "Apr 25, 2021 at 09:45 PM" (short month name)
HUMAN_DATE_RE = re.compile(
    r"^[A-Z][a-z]{2} \d{2}, \d{4} at \d{2}:\d{2} [AP]M$"
)


def _unwrap(result):
    """Return the tool's wrapped result dict (structuredContent or text JSON)."""
    if result.structuredContent is not None:
        return result.structuredContent
    text = "\n".join(
        block.text
        for block in result.content
        if getattr(block, "type", None) == "text"
    )
    return json.loads(text)


async def _call(session, name, arguments):
    result = await session.call_tool(name, arguments)
    return result, _unwrap(result)


def _run_async(coro):
    return asyncio.run(coro)


def test_get_customers_returns_10_records_with_expected_fields():
    async def run():
        params = StdioServerParameters(
            command=sys.executable,
            args=[str(SERVER)],
        )
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()

                result, payload = await _call(session, "get_customers", {"count": 10})
                assert result.isError is False
                records = payload["result"]
                assert len(records) == 10
                assert [r["id"] for r in records] == list(range(1, 11))
                for record in records:
                    assert CUSTOMER_FIELDS.issubset(record.keys())
                    assert isinstance(record["name"], str) and record["name"]
                    assert "@" in record["email"]
                    assert E164_RE.fullmatch(record["phone"]), record["phone"]
                    # +91 (India) + 10-digit mobile starting 6-9.
                    assert record["phone"].startswith("+91"), record["phone"]
                    assert len(record["phone"]) == 13, record["phone"]
                    assert record["phone"][3] in "6789", record["phone"]
                    assert HUMAN_DATE_RE.fullmatch(
                        record["created_at"]
                    ), record["created_at"]

    _run_async(run())


def test_get_customers_count_is_respected():
    async def run():
        params = StdioServerParameters(
            command=sys.executable,
            args=[str(SERVER)],
        )
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()

                _, payload = await _call(session, "get_customers", {"count": 3})
                assert len(payload["result"]) == 3

                # Out-of-range counts are rejected by the tool schema.
                result = await session.call_tool("get_customers", {"count": 0})
                assert result.isError is True
                error_text = "\n".join(
                    b.text for b in result.content if b.type == "text"
                )
                assert "greater than or equal to 1" in error_text

    _run_async(run())


def test_tools_list_contains_get_customers():
    async def run():
        params = StdioServerParameters(
            command=sys.executable,
            args=[str(SERVER)],
        )
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                tools = await session.list_tools()
                names = [t.name for t in tools.tools]
                assert "get_customers" in names
                assert "get_time" in names
                assert "add" in names

    _run_async(run())
