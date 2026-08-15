"""FastMCP server with two public tools and two admin-only tools.

Run:
    MCP_SECRET_KEY=dev-secret uvicorn main:app --port 8000

Endpoints:
    POST /login  ->  {access_token, ...}   (username/password from MCP_USERS)
    POST /mcp    ->  Streamable HTTP MCP endpoint (bearer-token protected)
"""

import asyncio
import csv
import os
from datetime import datetime, timezone
from io import BytesIO, StringIO
from typing import Annotated, Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import mcp.types as mcp_types
from faker import Faker
from fastmcp import Context, FastMCP
from fastmcp.resources.template import ResourceTemplate
from fastmcp.server.auth import require_scopes
from fastmcp.server.http import create_streamable_http_app
from fastmcp.utilities.types import Image
from PIL import Image as PILImage
from PIL import ImageDraw, ImageFont
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

    Phone numbers are E.164-formatted (+91 country code); created_at is a
    human-readable date string.
    """
    return _build_customers(count)


def _build_customers(count: int) -> list[dict[str, Any]]:
    """Generate `count` sample customer records (seeded Faker)."""
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


@mcp.resource(
    "customers://latest",
    mime_type="application/json",
    description="Latest sample customer records as JSON",
    auth=require_scopes("admin"),
)
def customers_latest() -> list[dict[str, Any]]:
    """The 10 most recent sample customer records (admin only)."""
    return _build_customers(10)


@mcp.resource(
    "report://revenue-chart",
    mime_type="image/png",
    description="PNG bar chart of sample monthly revenue",
    auth=require_scopes("admin"),
)
def revenue_chart() -> bytes:
    """Sample monthly revenue chart as a PNG blob (admin only)."""
    return _make_revenue_chart_png()


def customer_by_id(id: str) -> dict[str, Any]:
    """One sample customer by numeric id (admin only)."""
    for customer in _build_customers(100):
        if str(customer["id"]) == id:
            return customer
    raise ValueError(f"Customer {id!r} not found")


# FastMCP 3.x has no @resource_template decorator — build the template
# explicitly and register it via add_template.
mcp.add_template(
    ResourceTemplate.from_function(
        customer_by_id,
        uri_template="customers://{id}",
        mime_type="application/json",
        description="A single sample customer by id",
        auth=require_scopes("admin"),
    )
)


@mcp.tool(auth=require_scopes("admin"))
async def generate_report(
    ctx: Context, count: Annotated[int, Field(ge=1, le=100)] = 10
):
    """Ask which report format to generate (admin only).

    Demonstrates user elicitation: the call pauses until the human picks
    an option (or declines/cancels), then resumes with their answer.
    Only CSV reports are actually generated; pdf/png return a notice.
    """
    answer = await ctx.elicit(
        "Choose a report format:",
        {
            "pdf": {"title": "PDF report", "description": "Portable Document Format"},
            "csv": {"title": "CSV export", "description": "Comma-separated values"},
            "png": {"title": "Revenue chart", "description": "PNG image"},
        },
    )
    if answer.action != "accept":
        return f"Report generation cancelled ({answer.action})."
    if answer.data != "csv":
        return (
            f"Only CSV reports are implemented; "
            f"'{answer.data}' is not supported yet."
        )
    return mcp_types.TextContent(
        type="text", text=_build_customers_csv(count), mimeType="text/csv"
    )


CUSTOMER_FIELDS = [
    "id",
    "name",
    "email",
    "phone",
    "company",
    "city",
    "country",
    "created_at",
]


def _build_customers_csv(count: int) -> str:
    """Serialize `count` sample customers as CSV text."""
    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=CUSTOMER_FIELDS)
    writer.writeheader()
    writer.writerows(_build_customers(count))
    return buffer.getvalue()


@mcp.tool(auth=require_scopes("admin"))
async def process_customers(
    ctx: Context,
    count: Annotated[int, Field(ge=1, le=100)] = 10,
) -> dict[str, Any]:
    """Simulate processing `count` customer records, reporting progress (admin only).

    Sends notifications/progress updates while it runs; clients that pass a
    progressToken (e.g. via onprogress) see a live progress bar.
    """
    for i in range(1, count + 1):
        await asyncio.sleep(0.15)
        await ctx.report_progress(i, count, f"Processing customer {i} of {count}")
    return {"status": "ok", "processed": count}


@mcp.tool(auth=require_scopes("admin"))
def chart_image() -> Image:
    """Generate a bar chart PNG of sample monthly revenue (admin only)."""
    png = _make_revenue_chart_png()
    return Image(data=png, format="png")


def _fmt_short(value: int) -> str:
    """Format a currency value compactly: $450k / $1.2M."""
    if value >= 1_000_000:
        return f"${value / 1_000_000:.1f}M"
    if value >= 1_000:
        return f"${value // 1_000}k"
    return f"${value}"


def _load_font(size: int) -> ImageFont.ImageFont | ImageFont.FreeTypeFont:
    """Load a TTF font from common paths, falling back to PIL's default."""
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def _text_width(draw: ImageDraw.ImageDraw, text: str, font) -> int:
    return draw.textbbox((0, 0), text, font=font)[2]


def _make_revenue_chart_png() -> bytes:
    """Draw a 12-month revenue bar chart with PIL and return PNG bytes."""
    width, height = 820, 440
    margin_l, margin_r, margin_t, margin_b = 90, 30, 70, 70
    chart_w = width - margin_l - margin_r
    chart_h = height - margin_t - margin_b

    short_months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]
    now = datetime.now()
    months = [((now.month - 1 - i) % 12) for i in range(11, -1, -1)]
    labels = [short_months[m] for m in months]
    values = [_fake.random_int(min=40_000, max=450_000) for _ in labels]

    img = PILImage.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)

    title_font = _load_font(26)
    label_font = _load_font(17)
    tick_font = _load_font(15)
    value_font = _load_font(13)

    draw.text((margin_l, 22), "Monthly Revenue (sample data)", font=title_font, fill="#1A202C")

    # Grid + Y labels
    y_max = ((max(values) // 50_000) + 1) * 50_000
    for i in range(6):
        y = margin_t + chart_h - (chart_h * i / 5)
        draw.line([(margin_l, y), (width - margin_r, y)], fill="#E2E8F0", width=1)
        tick = _fmt_short(int(y_max * i / 5))
        draw.text((margin_l - 10, y - 8), tick, font=tick_font, fill="#718096")

    # Bars + labels
    slot = chart_w / len(values)
    bar_w = slot * 0.55
    for i, (label, value) in enumerate(zip(labels, values)):
        x0 = margin_l + slot * i + (slot - bar_w) / 2
        bar_h = chart_h * value / y_max
        y0 = margin_t + chart_h - bar_h
        draw.rectangle([x0, y0, x0 + bar_w, margin_t + chart_h], fill="#3182CE")
        value_label = _fmt_short(value)
        draw.text(
            (x0 + bar_w / 2 - _text_width(draw, value_label, value_font) / 2, y0 - 18),
            value_label,
            font=value_font,
            fill="#2D3748",
        )
        draw.text(
            (x0 + bar_w / 2 - _text_width(draw, label, label_font) / 2, margin_t + chart_h + 12),
            label,
            font=label_font,
            fill="#4A5568",
        )

    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


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
