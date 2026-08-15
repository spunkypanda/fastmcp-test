import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  ElicitRequestSchema,
  type CallToolResult,
  type ReadResourceResult,
  type Resource,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { getToken } from "./auth";
import { presentElicitation } from "./elicitation";

// The SDK transport pins the Authorization header at construction time, so
// whenever the token changes we tear down and rebuild the client/transport.
let client: Client | null = null;
let connectedToken: string | null = null;
let connectPromise: Promise<Client> | null = null;

function transportFor(token: string): StreamableHTTPClientTransport {
  return new StreamableHTTPClientTransport(
    new URL("/mcp", window.location.origin),
    {
      requestInit: {
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  );
}

export async function connectMCP(): Promise<Client> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  if (client && connectedToken === token) return client;

  // Token changed (login as a different user) or never connected — rebuild.
  await disconnectMCP();
  connectedToken = token;
  connectPromise = (async () => {
    const c = new Client(
      { name: "fastmcp-client", version: "0.1.0" },
      {
        capabilities: {
          // Declare that we can present elicitation forms to the user, so the
          // server may pause tool calls and ask the human for input.
          elicitation: { form: {} },
        },
      },
    );
    // Server->client requests arrive over the open SSE stream; present them
    // to the user via the ElicitationDialog and return their answer.
    c.setRequestHandler(ElicitRequestSchema, (request) =>
      presentElicitation(request),
    );
    await c.connect(transportFor(token));
    return c;
  })();

  try {
    client = await connectPromise;
  } catch (err) {
    connectPromise = null;
    connectedToken = null;
    throw err;
  }
  return client;
}

export async function disconnectMCP(): Promise<void> {
  if (client) {
    await client.close().catch(() => {});
    client = null;
  }
  connectPromise = null;
  connectedToken = null;
}

export async function listTools(): Promise<Tool[]> {
  const c = await connectMCP();
  const result = await c.listTools();
  return result.tools;
}

export async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const c = await connectMCP();
  return c.callTool({ name, arguments: args }) as Promise<CallToolResult>;
}

export async function listResources(): Promise<Resource[]> {
  const c = await connectMCP();
  const result = await c.listResources();
  return result.resources;
}

export async function readResource(
  uri: string,
): Promise<ReadResourceResult> {
  const c = await connectMCP();
  return c.readResource({ uri });
}
