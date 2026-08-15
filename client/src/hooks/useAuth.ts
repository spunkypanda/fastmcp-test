import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { clearToken, login, setToken } from "../mcp/auth";
import { disconnectMCP } from "../mcp/client";

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      login(username, password),
    onSuccess: (token) => {
      setToken(token);
      qc.invalidateQueries({ queryKey: ["mcp"] });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useCallback(async () => {
    await disconnectMCP();
    clearToken();
    qc.removeQueries({ queryKey: ["mcp"] });
  }, [qc]);
}
