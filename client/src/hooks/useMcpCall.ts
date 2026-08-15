import { useMutation } from "@tanstack/react-query";
import type { CallToolResult, Progress } from "@modelcontextprotocol/sdk/types.js";
import { callTool } from "../mcp/client";

interface CallArgs {
  args: Record<string, unknown>;
  /** Receive notifications/progress updates while the tool runs. */
  onProgress?: (progress: Progress) => void;
}

export function useMcpCall(toolName: string) {
  return useMutation<CallToolResult, Error, CallArgs>({
    mutationFn: ({ args, onProgress }) => callTool(toolName, args, onProgress),
  });
}
