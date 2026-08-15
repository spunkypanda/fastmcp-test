import { useSyncExternalStore, useState } from "react";
import {
  Box,
  Card,
  Container,
  Grid,
  Heading,
  HStack,
  Tabs,
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
import { ResourcesPanel } from "./components/ResourcesPanel";
import { ResourceViewer } from "./components/ResourceViewer";
import { ElicitationDialog } from "./components/ElicitationDialog";

export default function App() {
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedResource, setSelectedResource] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("tools");
  const tools = useMcpTools();
  const isAuthed = useSyncExternalStore(subscribeAuth, isAuthenticated);

  if (!isAuthed) {
    return <LoginPanel />;
  }

  const selectedTool =
    tools.data?.find((t) => t.name === selected) ?? null;

  const rightPanel = (() => {
    if (tab === "tools") {
      return selectedTool ? (
        <ToolCard key={selectedTool.name} tool={selectedTool} />
      ) : (
        <Card.Root>
          <Card.Body>
            <Text color="fg.muted" fontSize="sm">
              Select a tool on the left to call it.
            </Text>
          </Card.Body>
        </Card.Root>
      );
    }
    return selectedResource ? (
      <ResourceViewer key={selectedResource} uri={selectedResource} />
    ) : (
      <Card.Root>
        <Card.Body>
          <Text color="fg.muted" fontSize="sm">
            Select a resource on the left to read it.
          </Text>
        </Card.Body>
      </Card.Root>
    );
  })();

  return (
    <>
      {/* Server-initiated prompts (tool calls pausing to ask the user). */}
      <ElicitationDialog />
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
            <Tabs.Root value={tab} onValueChange={(e) => setTab(e.value)}>
              <Tabs.List>
                <Tabs.Trigger value="tools">Tools</Tabs.Trigger>
                <Tabs.Trigger value="resources">Resources</Tabs.Trigger>
              </Tabs.List>
              <Tabs.Content value="tools">
                <ToolsList selected={selected} onSelect={setSelected} />
              </Tabs.Content>
              <Tabs.Content value="resources">
                <ResourcesPanel
                  selected={selectedResource}
                  onSelect={setSelectedResource}
                />
              </Tabs.Content>
            </Tabs.Root>

            <Box>{rightPanel}</Box>
          </Grid>
        </VStack>
      </Container>
    </>
  );
}
