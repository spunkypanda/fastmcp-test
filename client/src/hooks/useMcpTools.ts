import { useQuery } from "@tanstack/react-query";
import { getToken } from "../mcp/auth";
import { listTools } from "../mcp/client";

/**
 * Fetch the tool list. The query key includes the current token so that
 * logging in/out (or switching users) triggers a fresh fetch with the
 * correct Authorization header. Disabled while signed out.
 */
export function useMcpTools() {
  const token = getToken();
  return useQuery({
    queryKey: ["mcp", "tools", token ?? "signed-out"],
    queryFn: listTools,
    enabled: token !== null,
    staleTime: 30_000,
    retry: 1,
  });
}
