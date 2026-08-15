import { Alert, Card, Heading, Spinner, Text } from "@chakra-ui/react";
import { useMcpResource } from "../hooks/useMcpResources";
import { ResourceContentsView } from "./ResourceContents";

/** Reads a resource by URI and renders its contents in the main panel. */
export function ResourceViewer({ uri }: { uri: string }) {
  const query = useMcpResource(uri);

  if (query.isLoading) {
    return (
      <Card.Root>
        <Card.Body>
          <Spinner size="sm" /> Reading {uri}…
        </Card.Body>
      </Card.Root>
    );
  }

  if (query.isError) {
    return (
      <Alert.Root status="error">
        <Alert.Title>Failed to read resource</Alert.Title>
        <Alert.Description>{query.error.message}</Alert.Description>
      </Alert.Root>
    );
  }

  return (
    <Card.Root>
      <Card.Header>
        <Heading size="md" wordBreak="break-all">
          {uri}
        </Heading>
        {query.data && (
          <Text color="fg.muted" fontSize="sm">
            {query.data.contents
              .map((c) => c.mimeType ?? "text/plain")
              .join(", ")}
          </Text>
        )}
      </Card.Header>
      <Card.Body>
        {query.data && (
          <ResourceContentsView contents={query.data.contents} />
        )}
      </Card.Body>
    </Card.Root>
  );
}
