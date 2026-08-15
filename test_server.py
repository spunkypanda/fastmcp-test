"""Server tests using the MCP stdio client (auth checks are skipped on stdio)."""

import asyncio
import base64
import json
import re
import sys
from pathlib import Path

import mcp.types as types
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


def test_chart_image_returns_png_content_block():
    async def run():
        params = StdioServerParameters(
            command=sys.executable,
            args=[str(SERVER)],
        )
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()

                result = await session.call_tool("chart_image", {})
                assert result.isError is False

                images = [
                    b for b in result.content if getattr(b, "type", None) == "image"
                ]
                assert len(images) == 1
                assert images[0].mimeType == "image/png"

                raw = base64.b64decode(images[0].data)
                assert raw[:8] == b"\x89PNG\r\n\x1a\n"  # PNG magic bytes
                assert len(raw) > 10_000  # a real rendered chart

    _run_async(run())


def test_generate_report_elicits_and_returns_real_csv():
    async def run():
        async def elicit_cb(ctx, params):
            # The human picks the CSV option.
            return types.ElicitResult(action="accept", content={"value": "csv"})

        params = StdioServerParameters(command=sys.executable, args=[str(SERVER)])
        async with stdio_client(params) as (read, write):
            async with ClientSession(
                read, write, elicitation_callback=elicit_cb
            ) as session:
                await session.initialize()

                result = await session.call_tool("generate_report", {})
                assert result.isError is False
                # A real CSV is returned as a text/csv content block.
                block = result.content[0]
                assert block.type == "text"
                assert block.mimeType == "text/csv"
                assert block.text.startswith(
                    "id,name,email,phone,company,city,country,created_at"
                )
                # header + 10 customer rows
                assert block.text.count("\n") == 11

    _run_async(run())


def test_generate_report_png_not_implemented():
    async def run():
        async def elicit_cb(ctx, params):
            return types.ElicitResult(action="accept", content={"value": "png"})

        params = StdioServerParameters(command=sys.executable, args=[str(SERVER)])
        async with stdio_client(params) as (read, write):
            async with ClientSession(
                read, write, elicitation_callback=elicit_cb
            ) as session:
                await session.initialize()

                result = await session.call_tool("generate_report", {})
                assert result.isError is False
                text = "\n".join(b.text for b in result.content if b.type == "text")
                assert "Only CSV reports are implemented" in text
                assert "'png' is not supported yet" in text

    _run_async(run())


def test_generate_report_handles_decline():
    async def run():
        async def elicit_cb(ctx, params):
            return types.ElicitResult(action="decline", content={})

        params = StdioServerParameters(command=sys.executable, args=[str(SERVER)])
        async with stdio_client(params) as (read, write):
            async with ClientSession(
                read, write, elicitation_callback=elicit_cb
            ) as session:
                await session.initialize()

                result = await session.call_tool("generate_report", {})
                assert result.isError is False
                text = "\n".join(b.text for b in result.content if b.type == "text")
                assert "cancelled (decline)" in text

    _run_async(run())


def test_resources_list_and_read():
    async def run():
        params = StdioServerParameters(
            command=sys.executable,
            args=[str(SERVER)],
        )
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()

                # resources/list advertises all three
                listed = await session.list_resources()
                uris = {str(r.uri) for r in listed.resources}
                assert "customers://latest" in uris
                assert "report://revenue-chart" in uris

                # text resource -> JSON customers
                latest = await session.read_resource("customers://latest")
                text_contents = latest.contents[0]
                assert hasattr(text_contents, "text")
                customers = json.loads(text_contents.text)
                assert isinstance(customers, list) and len(customers) == 10

                # blob resource -> PNG
                chart = await session.read_resource("report://revenue-chart")
                blob = chart.contents[0].blob
                raw = base64.b64decode(blob)
                assert raw[:8] == b"\x89PNG\r\n\x1a\n"

                # template resource -> single customer by id
                single = await session.read_resource("customers://1")
                customer = json.loads(single.contents[0].text)
                assert customer["id"] == 1

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
                assert "chart_image" in names
                assert "add" in names

    _run_async(run())
