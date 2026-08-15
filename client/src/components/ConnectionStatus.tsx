import { useState } from "react";
import { Badge, Button, HStack, Spinner, Tag, Text } from "@chakra-ui/react";
import { getUser } from "../mcp/auth";
import { useMcpTools } from "../hooks/useMcpTools";
import { useLogout } from "../hooks/useAuth";

export function ConnectionStatus() {
  const tools = useMcpTools();
  const logout = useLogout();
  const [signingOut, setSigningOut] = useState(false);
  const user = getUser();

  const state = tools.isLoading
    ? { label: "Connecting…", color: "yellow", spinner: true }
    : tools.isError
      ? { label: "Connection failed", color: "red", spinner: false }
      : { label: "Connected", color: "green", spinner: false };

  return (
    <HStack gap="3" wrap="wrap">
      <Tag.Root size="lg" colorPalette={state.color}>
        {state.spinner && <Spinner size="xs" />}
        <Tag.Label>{state.label}</Tag.Label>
      </Tag.Root>

      {user && (
        <>
          <Text fontSize="sm">
            Signed in as <strong>{user.username}</strong>
          </Text>
          {user.scopes.map((s) => (
            <Badge key={s} colorPalette={s === "admin" ? "purple" : "teal"}>
              {s}
            </Badge>
          ))}
        </>
      )}

      <Button
        size="sm"
        variant="outline"
        loading={signingOut}
        onClick={async () => {
          setSigningOut(true);
          await logout();
        }}
      >
        Sign out
      </Button>
    </HStack>
  );
}
