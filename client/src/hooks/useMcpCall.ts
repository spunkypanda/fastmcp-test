import { useMutation } from "@tanstack/react-query";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { callTool } from "../mcp/client";

export function useMcpCall(toolName: string) {
  return useMutation<CallToolResult, Error, Record<string, unknown>>({
    mutationFn: (args) => callTool(toolName, args),
  });
}
