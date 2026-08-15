import { useQuery } from "@tanstack/react-query";
import { getToken } from "../mcp/auth";
import { listResources, readResource } from "../mcp/client";

/** Resources available to the current user (token-scoped, like tools). */
export function useMcpResources() {
  const token = getToken();
  return useQuery({
    queryKey: ["mcp", "resources", token ?? "signed-out"],
    queryFn: listResources,
    enabled: token !== null,
    staleTime: 30_000,
    retry: 1,
  });
}

/** Read a single resource by URI. */
export function useMcpResource(uri: string | null) {
  return useQuery({
    queryKey: ["mcp", "resource", uri ?? "none"],
    queryFn: () => readResource(uri as string),
    enabled: uri !== null,
    retry: 1,
  });
}
