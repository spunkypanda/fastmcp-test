import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Box, Card, Heading, Skeleton, Text, VStack } from "@chakra-ui/react";
import { useMcpTools } from "../hooks/useMcpTools";

interface Props {
  selected: string | null;
  onSelect: (name: string) => void;
}

export function ToolsList({ selected, onSelect }: Props) {
  const tools = useMcpTools();

  if (tools.isLoading) {
    return (
      <VStack gap="3" align="stretch">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height="80px" />
        ))}
      </VStack>
    );
  }

  if (tools.isError) {
    return (
      <Card.Root>
        <Card.Body>
          <Text color="fg.error" fontSize="sm">
            Failed to load tools: {tools.error.message}
          </Text>
        </Card.Body>
      </Card.Root>
    );
  }

  const toolList = tools.data ?? [];

  return (
    <VStack gap="3" align="stretch">
      <Heading size="sm" color="fg.muted">
        Tools ({toolList.length})
      </Heading>
      {toolList.length === 0 && (
        <Card.Root>
          <Card.Body>
            <Text fontSize="sm" color="fg.muted">
              No tools available for this user. Try signing in as admin.
            </Text>
          </Card.Body>
        </Card.Root>
      )}
      {toolList.map((tool) => (
        <ToolListItem
          key={tool.name}
          tool={tool}
          active={tool.name === selected}
          onClick={() => onSelect(tool.name)}
        />
      ))}
    </VStack>
  );
}

function ToolListItem({
  tool,
  active,
  onClick,
}: {
  tool: Tool;
  active: boolean;
  onClick: () => void;
}) {
  const name = tool.name;
  const desc = tool.description ?? "No description";
  const paramCount = Object.keys(tool.inputSchema?.properties ?? {}).length;

  return (
    <Box
      as="button"
      onClick={onClick}
      textAlign="left"
      p={3}
      borderRadius="md"
      borderWidth="1px"
      borderColor={active ? "blue.400" : "border.subtle"}
      bg={active ? "blue.500/15" : "transparent"}
      _hover={{ bg: active ? "blue.500/25" : "bg.muted" }}
      cursor="pointer"
      width="100%"
    >
      <Text fontWeight="semibold" fontSize="sm">
        {name}
      </Text>
      <Text fontSize="xs" color="fg.muted" lineClamp={2}>
        {desc}
      </Text>
      <Text fontSize="xs" color="fg.subtle" mt={1}>
        {paramCount} argument{paramCount === 1 ? "" : "s"}
      </Text>
    </Box>
  );
}
