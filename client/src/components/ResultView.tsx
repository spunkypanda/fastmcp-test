import { useEffect, useState } from "react";
import type {
  CallToolResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { Alert, Code, Image, Text, VStack } from "@chakra-ui/react";
import { readResource } from "../mcp/client";
import { DataTable } from "./DataTable";
import {
  ResourceContentsView,
  type ResourceContents,
} from "./ResourceContents";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dataUrl(mimeType: string, data: string): string {
  return `data:${mimeType};base64,${data}`;
}

export function ResultView({
  result,
  error,
  isPending,
}: {
  result: CallToolResult | undefined;
  error: Error | null;
  isPending: boolean;
}) {
  if (isPending) {
    return (
      <Alert.Root status="info">
        <Alert.Title>Calling tool…</Alert.Title>
      </Alert.Root>
    );
  }

  if (error) {
    const msg = error.message;
    const looksUnauthorized =
      /unauthorized|401|not authorized|insufficient|authentication/i.test(msg);
    return (
      <Alert.Root status={looksUnauthorized ? "warning" : "error"}>
        <Alert.Title>
          {looksUnauthorized ? "Authorization required" : "Tool call failed"}
        </Alert.Title>
        <Alert.Description>{msg}</Alert.Description>
      </Alert.Root>
    );
  }

  if (!result) return null;

  if (result.isError) {
    const text = extractText(result);
    return (
      <Alert.Root status="error">
        <Alert.Title>Tool returned an error</Alert.Title>
        <Alert.Description>{text}</Alert.Description>
      </Alert.Root>
    );
  }

  // List-of-records results (e.g. get_customers) render as a table.
  const records = extractRecords(result);
  if (records) {
    return (
      <VStack align="stretch" gap="2">
        <Text fontSize="sm" fontWeight="semibold">
          Result ({records.length} records)
        </Text>
        <DataTable records={records} />
      </VStack>
    );
  }

  // Raw text with an explicit mimeType (e.g. text/csv) renders unescaped
  // instead of being JSON-wrapped.
  const blocks = result.content ?? [];
  const typedTextBlocks = blocks.filter(
    (b) => b.type === "text" && "mimeType" in b,
  );
  if (typedTextBlocks.length > 0 && typedTextBlocks.length === blocks.length) {
    return (
      <VStack align="stretch" gap="2">
        <Text fontSize="sm" fontWeight="semibold">
          Result
        </Text>
        {typedTextBlocks.map((block, i) => {
          const b = block as { type: "text"; text: string; mimeType?: string };
          return (
            <Code
              key={i}
              as="pre"
              display="block"
              variant="outline"
              p="3"
              width="100%"
              maxH="400px"
              overflow="auto"
              whiteSpace="pre-wrap"
              fontSize="sm"
            >
              {b.text}
            </Code>
          );
        })}
      </VStack>
    );
  }

  // Non-text content (image/audio/resource/…) renders per block type.
  if (blocks.some((b) => b.type !== "text")) {
    return (
      <VStack align="stretch" gap="3">
        <Text fontSize="sm" fontWeight="semibold">
          Result
        </Text>
        {blocks.map((block, i) => {
          switch (block.type) {
            case "text":
              return (
                <Text key={i} fontSize="sm" whiteSpace="pre-wrap">
                  {block.text}
                </Text>
              );
            case "image":
              return (
                <Image
                  key={i}
                  src={dataUrl(block.mimeType, block.data)}
                  alt={`Image result (${block.mimeType})`}
                  maxH="300px"
                  width="fit-content"
                  borderRadius="md"
                  borderWidth="1px"
                />
              );
            case "audio":
              return (
                <audio
                  key={i}
                  controls
                  src={dataUrl(block.mimeType, block.data)}
                  style={{ width: "100%" }}
                />
              );
            case "resource":
              return (
                <ResourceContentsView
                  key={i}
                  contents={[block.resource] as ResourceContents}
                />
              );
            case "resource_link":
              return <ResourceLinkView key={i} uri={block.uri} />;
            default:
              // resource / embedded — show their JSON shape.
              return (
                <Code key={i} as="pre" variant="outline" display="block" p="3" fontSize="sm">
                  {JSON.stringify(block, null, 2)}
                </Code>
              );
          }
        })}
      </VStack>
    );
  }

  return (
    <VStack align="stretch" gap="2">
      <Text fontSize="sm" fontWeight="semibold">
        Result
      </Text>
      <Code
        as="pre"
        variant="outline"
        display="block"
        p="3"
        width="100%"
        maxH="300px"
        overflow="auto"
        whiteSpace="pre-wrap"
        fontSize="sm"
      >
        {JSON.stringify(
          result.structuredContent ?? { content: extractText(result) },
          null,
          2,
        )}
      </Code>
    </VStack>
  );
}

/**
 * A resource_link content block is a URI reference — resolve it via
 * resources/read and render whatever comes back.
 */
function ResourceLinkView({ uri }: { uri: string }) {
  const [state, setState] = useState<{
    loading: boolean;
    contents?: ResourceContents;
    error?: string;
  }>({ loading: true });

  useEffect(() => {
    let alive = true;
    setState({ loading: true });
    readResource(uri)
      .then((result: ReadResourceResult) => {
        if (alive) setState({ loading: false, contents: result.contents });
      })
      .catch((err: Error) => {
        if (alive) setState({ loading: false, error: err.message });
      });
    return () => {
      alive = false;
    };
  }, [uri]);

  if (state.loading) {
    return (
      <Alert.Root status="info">
        <Alert.Title>Loading {uri}…</Alert.Title>
      </Alert.Root>
    );
  }
  if (state.error) {
    return (
      <Alert.Root status="error">
        <Alert.Title>Failed to load {uri}</Alert.Title>
        <Alert.Description>{state.error}</Alert.Description>
      </Alert.Root>
    );
  }
  return <ResourceContentsView contents={state.contents ?? []} />;
}

/** Returns a record array when the result is a list of flat objects. */
function extractRecords(
  result: CallToolResult,
): Record<string, unknown>[] | null {
  const structured = result.structuredContent as
    | Record<string, unknown>
    | undefined;
  const maybeList = structured?.result;
  if (!Array.isArray(maybeList) || maybeList.length === 0) return null;
  if (!maybeList.every(isRecord)) return null;
  return maybeList;
}

function extractText(result: CallToolResult): string {
  return (result.content ?? [])
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n");
}
