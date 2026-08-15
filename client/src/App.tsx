import { useSyncExternalStore, useState } from "react";
import {
  Box,
  Card,
  Container,
  Grid,
  Heading,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { isAuthenticated, subscribeAuth } from "./mcp/auth";
import { useMcpTools } from "./hooks/useMcpTools";
import { LoginPanel } from "./components/LoginPanel";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { ToolsList } from "./components/ToolsList";
import { ToolCard } from "./components/ToolCard";
import { ColorModeToggle } from "./components/ColorModeToggle";

export default function App() {
  const [selected, setSelected] = useState<string | null>(null);
  const tools = useMcpTools();
  const isAuthed = useSyncExternalStore(subscribeAuth, isAuthenticated);

  if (!isAuthed) {
    return <LoginPanel />;
  }

  const selectedTool =
    tools.data?.find((t) => t.name === selected) ?? null;

  return (
    <Container maxW="container.xl" py={6}>
      <VStack align="stretch" gap={5}>
        <HStack justify="space-between" wrap="wrap" gap={3}>
          <Heading size="lg">FastMCP Client</Heading>
          <HStack gap={2}>
            <ColorModeToggle />
            <ConnectionStatus />
          </HStack>
        </HStack>

        <Grid
          templateColumns={{ base: "1fr", md: "300px 1fr" }}
          gap={6}
          alignItems="start"
        >
          <ToolsList selected={selected} onSelect={setSelected} />

          <Box>
            {selectedTool ? (
              <ToolCard key={selectedTool.name} tool={selectedTool} />
            ) : (
              <Card.Root>
                <Card.Body>
                  <Text color="fg.muted" fontSize="sm">
                    Select a tool on the left to call it.
                  </Text>
                </Card.Body>
              </Card.Root>
            )}
          </Box>
        </Grid>
      </VStack>
    </Container>
  );
}
