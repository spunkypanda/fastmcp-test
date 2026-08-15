import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Field,
  Heading,
  Input,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useLogin } from "../hooks/useAuth";

const DEMO_HINT =
  "Demo users — admin:secret (all tools) · alice:wonder (public tools only)";

export function LoginPanel() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    login.mutate({ username, password });
  };

  return (
    <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" p={4}>
      <Card.Root width="md">
        <Card.Header>
          <Heading size="lg">FastMCP Client</Heading>
          <Text color="fg.muted" fontSize="sm">
            Sign in to connect to the MCP server
          </Text>
        </Card.Header>
        <Card.Body>
          <form onSubmit={submit}>
            <Stack gap="4">
              <Field.Root required>
                <Field.Label>Username</Field.Label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  autoFocus
                />
              </Field.Root>
              <Field.Root required>
                <Field.Label>Password</Field.Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                />
              </Field.Root>

              {login.isError && (
                <Alert.Root status="error">
                  <Alert.Title>{login.error.message}</Alert.Title>
                </Alert.Root>
              )}

              <Button
                type="submit"
                colorPalette="blue"
                loading={login.isPending}
                disabled={!username || !password}
              >
                Sign in
              </Button>
            </Stack>
          </form>
        </Card.Body>
        <Card.Footer>
          <Text fontSize="xs" color="fg.muted">
            {DEMO_HINT}
          </Text>
        </Card.Footer>
      </Card.Root>
    </Box>
  );
}
