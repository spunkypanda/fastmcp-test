import { Badge, Box, Card, Heading, Skeleton, Text, VStack } from "@chakra-ui/react";
import { useMcpResources } from "../hooks/useMcpResources";

interface Props {
  selected: string | null;
  onSelect: (uri: string) => void;
}

export function ResourcesPanel({ selected, onSelect }: Props) {
  const resources = useMcpResources();

  if (resources.isLoading) {
    return (
      <VStack gap="3" align="stretch">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height="60px" />
        ))}
      </VStack>
    );
  }

  if (resources.isError) {
    return (
      <Card.Root>
        <Card.Body>
          <Text color="fg.error" fontSize="sm">
            Failed to load resources: {resources.error.message}
          </Text>
        </Card.Body>
      </Card.Root>
    );
  }

  const list = resources.data ?? [];

  return (
    <VStack gap="3" align="stretch">
      <Heading size="sm" color="fg.muted">
        Resources ({list.length})
      </Heading>
      {list.length === 0 && (
        <Card.Root>
          <Card.Body>
            <Text fontSize="sm" color="fg.muted">
              No resources available for this user. Try signing in as admin.
            </Text>
          </Card.Body>
        </Card.Root>
      )}
      {list.map((resource) => (
        <Box
          key={resource.uri}
          as="button"
          onClick={() => onSelect(resource.uri)}
          textAlign="left"
          p={3}
          borderRadius="md"
          borderWidth="1px"
          borderColor={
            selected === resource.uri ? "blue.400" : "border.subtle"
          }
          bg={selected === resource.uri ? "blue.500/15" : "transparent"}
          _hover={{
            bg:
              selected === resource.uri ? "blue.500/25" : "bg.muted",
          }}
          cursor="pointer"
          width="100%"
        >
          <Text fontWeight="semibold" fontSize="sm" wordBreak="break-all">
            {resource.uri}
          </Text>
          <Text fontSize="xs" color="fg.muted" lineClamp={2}>
            {resource.description ?? resource.name ?? ""}
          </Text>
          {resource.mimeType && (
            <Badge mt={1} colorPalette="teal" fontSize="xs">
              {resource.mimeType}
            </Badge>
          )}
        </Box>
      ))}
    </VStack>
  );
}
