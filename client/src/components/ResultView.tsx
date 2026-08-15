import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Alert, Code, Text, VStack } from "@chakra-ui/react";
import { DataTable } from "./DataTable";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

  return (
    <VStack align="stretch" gap="2">
      <Text fontSize="sm" fontWeight="semibold">
        Result
      </Text>
      <Code
        as="pre"
        variant="outline"
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
