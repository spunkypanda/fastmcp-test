import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import type {
  CallToolResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import App from "./App";
import * as mcpClient from "./mcp/client";
import { cancelElicitation, presentElicitation } from "./mcp/elicitation";

// Don't touch the real MCP transport in unit tests — the login->UI switch
// is the behavior under test. (The real connect flow is covered by curl/e2e.)
vi.mock("./mcp/client", () => ({
  listTools: vi.fn(async () => [
    {
      name: "add",
      description: "Add two numbers together.",
      inputSchema: {
        type: "object",
        properties: { a: { type: "number" }, b: { type: "number" } },
        required: ["a", "b"],
      },
    },
    {
      name: "secret_message",
      description: "Return a secret message (admin only).",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_time",
      description: "Get the current time in a timezone (admin only).",
      inputSchema: {
        type: "object",
        properties: {
          timezone_name: {
            anyOf: [{ type: "string" }, { type: "null" }],
            default: null,
          },
        },
      },
    },
    {
      name: "get_customers",
      description: "Return sample customer records (admin only).",
      inputSchema: {
        type: "object",
        properties: { count: { type: "number", default: 10 } },
      },
    },
  ]),
  callTool: vi.fn(),
  connectMCP: vi.fn(),
  disconnectMCP: vi.fn(),
  listResources: vi.fn(async () => [
    {
      uri: "customers://latest",
      name: "customers_latest",
      mimeType: "application/json",
      description: "Latest sample customer records as JSON",
    },
    {
      uri: "report://revenue-chart",
      name: "revenue_chart",
      mimeType: "image/png",
      description: "PNG bar chart of sample monthly revenue",
    },
  ]),
  readResource: vi.fn(),
}));

// A plausible-looking JWT so getUser() can decode sub/scopes.
const TOKEN = [
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  btoa(
    JSON.stringify({
      sub: "admin",
      scopes: ["admin"],
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ),
  "signature",
].join(".");

function renderApp() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <ChakraProvider value={defaultSystem}>
      <QueryClientProvider client={qc}>
        <App />
      </QueryClientProvider>
    </ChakraProvider>,
  );
}

function stubLogin(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

describe("login flow", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("switches from the login panel to the tools UI after a successful login", async () => {
    stubLogin(200, {
      access_token: TOKEN,
      token_type: "bearer",
      expires_in: 3600,
    });
    renderApp();

    // Signed out: login panel is shown.
    expect(
      screen.getByRole("button", { name: /sign in/i }),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("admin"), "admin");
    await userEvent.type(screen.getByPlaceholderText("••••••"), "secret");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    // The app must re-render into the authenticated view.
    await waitFor(() => {
      expect(screen.getByText(/signed in as/i)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText("add")).toBeInTheDocument();
      expect(screen.getByText("secret_message")).toBeInTheDocument();
    });
  });

  it("shows an error on invalid credentials and stays on the login panel", async () => {
    stubLogin(401, { error: "invalid_credentials" });
    renderApp();

    await userEvent.type(screen.getByPlaceholderText("admin"), "admin");
    await userEvent.type(screen.getByPlaceholderText("••••••"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/invalid username or password/i),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/signed in as admin/i)).not.toBeInTheDocument();
  });
});

describe("color mode", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("toggles the dark class on <html> and updates the button label", async () => {
    stubLogin(200, {
      access_token: TOKEN,
      token_type: "bearer",
      expires_in: 3600,
    });
    renderApp();

    await userEvent.type(screen.getByPlaceholderText("admin"), "admin");
    await userEvent.type(screen.getByPlaceholderText("••••••"), "secret");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText(/signed in as/i)).toBeInTheDocument();
    });

    // Starts light (matchMedia stub reports light).
    const toggle = screen.getByRole("button", {
      name: /switch to dark mode/i,
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    await userEvent.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(
      screen.getByRole("button", { name: /switch to light mode/i }),
    ).toBeInTheDocument();
    expect(localStorage.getItem("fastmcp-color-mode")).toBe("dark");
  });
});

describe("get_time form", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders a timezone dropdown defaulting to Asia/Kolkata instead of a text box", async () => {
    stubLogin(200, {
      access_token: TOKEN,
      token_type: "bearer",
      expires_in: 3600,
    });
    renderApp();

    await userEvent.type(screen.getByPlaceholderText("admin"), "admin");
    await userEvent.type(screen.getByPlaceholderText("••••••"), "secret");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText("get_time")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("get_time"));

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(select.value).toBe("Asia/Kolkata");
    expect(screen.getAllByRole("option")).toHaveLength(10);
    expect(screen.getByText(/IST/i)).toBeInTheDocument();

    // Picking another zone updates the selected value.
    await userEvent.selectOptions(select, "Asia/Tokyo");
    expect(select.value).toBe("Asia/Tokyo");
  });
});

describe("get_customers result table", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(mcpClient.callTool).mockReset();
  });

  it("renders customer records as a table after calling get_customers", async () => {
    stubLogin(200, {
      access_token: TOKEN,
      token_type: "bearer",
      expires_in: 3600,
    });
    vi.mocked(mcpClient.callTool).mockResolvedValue({
      content: [],
      structuredContent: {
        result: [
          {
            id: 1,
            name: "Allison Hill",
            email: "allison@example.net",
            phone: "+1-219-560-0133",
            company: "Santos Inc",
            city: "Lisatown",
            country: "Senegal",
            created_at: "2025-05-02T22:37:58",
          },
          {
            id: 2,
            name: "Gina Moore",
            email: "gina@example.com",
            phone: "(794)507-8161",
            company: "Jones LLC",
            city: "Port Jesseville",
            country: "Hong Kong",
            created_at: "2021-11-03T07:16:21",
          },
        ],
      },
      isError: false,
    } as CallToolResult);

    renderApp();

    await userEvent.type(screen.getByPlaceholderText("admin"), "admin");
    await userEvent.type(screen.getByPlaceholderText("••••••"), "secret");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText("get_customers")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("get_customers"));
    await userEvent.click(
      screen.getByRole("button", { name: /call get_customers/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("Result (2 records)")).toBeInTheDocument();
      expect(screen.getByText("Allison Hill")).toBeInTheDocument();
      expect(screen.getByText("Gina Moore")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("columnheader", { name: /email/i }),
    ).toBeInTheDocument();
    expect(mcpClient.callTool).toHaveBeenCalledWith("get_customers", {
      count: 10,
    });
  });
});

describe("non-text results", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(mcpClient.callTool).mockReset();
  });

  it("renders image, audio, and text content blocks", async () => {
    stubLogin(200, {
      access_token: TOKEN,
      token_type: "bearer",
      expires_in: 3600,
    });
    vi.mocked(mcpClient.callTool).mockResolvedValue({
      content: [
        { type: "text", text: "Here is the chart:" },
        {
          type: "image",
          data: "iVBORw0KGgoAAAANSUhEUg==",
          mimeType: "image/png",
        },
        {
          type: "audio",
          data: "UklGRiQAAABXQVZFZm10",
          mimeType: "audio/mpeg",
        },
      ],
      isError: false,
    } as CallToolResult);

    renderApp();

    await userEvent.type(screen.getByPlaceholderText("admin"), "admin");
    await userEvent.type(screen.getByPlaceholderText("••••••"), "secret");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText("secret_message")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("secret_message"));
    await userEvent.click(
      screen.getByRole("button", { name: /call secret_message/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("Here is the chart:")).toBeInTheDocument();
      const img = screen.getByRole("img") as HTMLImageElement;
      expect(img.getAttribute("src")).toBe(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
      );
      const audio = document.querySelector("audio") as HTMLAudioElement;
      expect(audio).not.toBeNull();
      expect(audio.getAttribute("src")).toBe(
        "data:audio/mpeg;base64,UklGRiQAAABXQVZFZm10",
      );
    });
  });
});

describe("resources", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(mcpClient.readResource).mockReset();
  });

  async function loginAsAdmin() {
    await userEvent.type(screen.getByPlaceholderText("admin"), "admin");
    await userEvent.type(screen.getByPlaceholderText("••••••"), "secret");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText(/signed in as/i)).toBeInTheDocument();
    });
  }

  it("lists resources and reads one on click", async () => {
    stubLogin(200, {
      access_token: TOKEN,
      token_type: "bearer",
      expires_in: 3600,
    });
    vi.mocked(mcpClient.readResource).mockResolvedValue({
      contents: [
        {
          uri: "customers://latest",
          mimeType: "application/json",
          text: JSON.stringify([{ id: 1, name: "Allison Hill" }]),
        },
      ],
    } as ReadResourceResult);

    renderApp();
    await loginAsAdmin();

    await userEvent.click(screen.getByRole("tab", { name: /resources/i }));
    await waitFor(() => {
      expect(screen.getByText("customers://latest")).toBeInTheDocument();
      expect(screen.getByText("report://revenue-chart")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("customers://latest"));
    await waitFor(() => {
      expect(mcpClient.readResource).toHaveBeenCalledWith("customers://latest");
      expect(screen.getByText(/Allison Hill/)).toBeInTheDocument();
    });
    // The JSON code block must be display:block — the Code recipe defaults to
    // inline-flex + align-items:center, which clips the top of tall content
    // inside a max-height scroll container. Chakra v3 compiles props into a
    // generated class + injected <style>, so assert on that rule.
    const codeBlock = screen.getByText(/Allison Hill/) as HTMLElement;
    expect(codeBlock.tagName).toBe("PRE");
    const generatedClass = codeBlock.className
      .split(" ")
      .find((c) => c.startsWith("css-"))!;
    const rule = (document.head?.innerHTML ?? "").match(
      new RegExp(`\\.${generatedClass}\\{[^}]*\\}`),
    );
    expect(rule?.[0]).toMatch(/display[: ]block/);
  });

  it("renders an inline resource content block in a tool result", async () => {
    stubLogin(200, {
      access_token: TOKEN,
      token_type: "bearer",
      expires_in: 3600,
    });
    vi.mocked(mcpClient.callTool).mockResolvedValue({
      content: [
        {
          type: "resource",
          resource: {
            uri: "customers://latest",
            mimeType: "application/json",
            text: "{\"ok\":true}",
          },
        },
      ],
      isError: false,
    } as CallToolResult);

    renderApp();
    await loginAsAdmin();

    await userEvent.click(screen.getByText("secret_message"));
    await userEvent.click(
      screen.getByRole("button", { name: /call secret_message/i }),
    );

    await waitFor(() => {
      expect(screen.getByText(/"ok": true/)).toBeInTheDocument();
    });
  });

  it("resolves a resource_link block via resources/read", async () => {
    stubLogin(200, {
      access_token: TOKEN,
      token_type: "bearer",
      expires_in: 3600,
    });
    vi.mocked(mcpClient.callTool).mockResolvedValue({
      content: [
        {
          type: "resource_link",
          uri: "customers://latest",
          name: "customers_latest",
          title: "Latest customers",
        },
      ],
      isError: false,
    } as CallToolResult);
    vi.mocked(mcpClient.readResource).mockResolvedValue({
      contents: [
        {
          uri: "customers://latest",
          mimeType: "application/json",
          text: JSON.stringify([{ id: 1, name: "Linked Customer" }]),
        },
      ],
    } as ReadResourceResult);

    renderApp();
    await loginAsAdmin();

    await userEvent.click(screen.getByText("secret_message"));
    await userEvent.click(
      screen.getByRole("button", { name: /call secret_message/i }),
    );

    await waitFor(() => {
      expect(screen.getByText(/Linked Customer/)).toBeInTheDocument();
    });
  });

  it("switches the main panel when changing tabs", async () => {
    stubLogin(200, {
      access_token: TOKEN,
      token_type: "bearer",
      expires_in: 3600,
    });
    vi.mocked(mcpClient.readResource).mockResolvedValue({
      contents: [
        {
          uri: "customers://latest",
          mimeType: "application/json",
          text: JSON.stringify([{ id: 1, name: "Tabbed Customer" }]),
        },
      ],
    } as ReadResourceResult);

    renderApp();
    await loginAsAdmin();

    // Select a tool -> tool card in the main panel.
    await userEvent.click(screen.getByText("add"));
    expect(
      screen.getByRole("button", { name: /call add/i }),
    ).toBeInTheDocument();

    // Switching to Resources must swap the main panel away from the tool.
    await userEvent.click(screen.getByRole("tab", { name: /resources/i }));
    expect(
      screen.queryByRole("button", { name: /call add/i }),
    ).not.toBeInTheDocument();

    // Selecting a resource shows the resource viewer in the main panel.
    await userEvent.click(screen.getByText("customers://latest"));
    await waitFor(() => {
      expect(screen.getByText(/Tabbed Customer/)).toBeInTheDocument();
    });

    // Back to Tools: the previously selected tool is still there.
    await userEvent.click(screen.getByRole("tab", { name: /tools/i }));
    expect(
      screen.getByRole("button", { name: /call add/i }),
    ).toBeInTheDocument();
  });
});

describe("elicitation dialog", () => {
  beforeEach(() => {
    localStorage.clear();
    cancelElicitation();
  });

  async function login() {
    await userEvent.type(screen.getByPlaceholderText("admin"), "admin");
    await userEvent.type(screen.getByPlaceholderText("••••••"), "secret");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText(/signed in as/i)).toBeInTheDocument();
    });
  }

  it("shows the form and submits the chosen answer", async () => {
    stubLogin(200, {
      access_token: TOKEN,
      token_type: "bearer",
      expires_in: 3600,
    });
    renderApp();
    await login();

    const promise = presentElicitation({
      method: "elicitation/create",
      params: {
        message: "Choose a report format:",
        requestedSchema: {
          type: "object",
          properties: {
            value: {
              type: "string",
              enum: ["pdf", "csv", "png"],
              enumNames: ["PDF report", "CSV export", "Revenue chart"],
            },
          },
          required: ["value"],
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByText("Choose a report format:")).toBeInTheDocument();
    });
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("pdf"); // defaults to first enum option

    await userEvent.selectOptions(select, "csv");
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));

    const result = await promise;
    expect(result.action).toBe("accept");
    expect(result.content).toEqual({ value: "csv" });
  });

  it("declines when the user clicks Decline", async () => {
    stubLogin(200, {
      access_token: TOKEN,
      token_type: "bearer",
      expires_in: 3600,
    });
    renderApp();
    await login();

    const promise = presentElicitation({
      method: "elicitation/create",
      params: {
        message: "Approve this action?",
        requestedSchema: {
          type: "object",
          properties: {
            value: { type: "string", enum: ["yes", "no"] },
          },
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByText("Approve this action?")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /decline/i }));

    const result = await promise;
    expect(result.action).toBe("decline");
  });
});

describe("csv report rendering", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(mcpClient.callTool).mockReset();
  });

  it("renders a text/csv content block as raw code", async () => {
    stubLogin(200, {
      access_token: TOKEN,
      token_type: "bearer",
      expires_in: 3600,
    });
    vi.mocked(mcpClient.callTool).mockResolvedValue({
      content: [
        {
          type: "text",
          mimeType: "text/csv",
          text: "id,name\n1,Allison Hill\n2,Gina Moore",
        },
      ],
      isError: false,
    } as unknown as CallToolResult);

    renderApp();
    await userEvent.type(screen.getByPlaceholderText("admin"), "admin");
    await userEvent.type(screen.getByPlaceholderText("••••••"), "secret");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText(/signed in as/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("secret_message"));
    await userEvent.click(
      screen.getByRole("button", { name: /call secret_message/i }),
    );

    await waitFor(() => {
      // Raw CSV text — not JSON-escaped (no \n in the output).
      expect(screen.getByText(/1,Allison Hill/)).toBeInTheDocument();
      expect(screen.queryByText(/\\n/)).not.toBeInTheDocument();
    });
  });
});
