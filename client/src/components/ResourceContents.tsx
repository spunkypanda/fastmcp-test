import type {
  BlobResourceContents,
  TextResourceContents,
} from "@modelcontextprotocol/sdk/types.js";
import { Code, Image, Text, VStack } from "@chakra-ui/react";

export type ResourceContents = (TextResourceContents | BlobResourceContents)[];

function dataUrl(mimeType: string, data: string): string {
  return `data:${mimeType};base64,${data}`;
}

function prettyJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}

/** Renders resource contents: JSON/text as code, blobs by mimeType. */
export function ResourceContentsView({
  contents,
}: {
  contents: ResourceContents;
}) {
  return (
    <VStack align="stretch" gap="3">
      {contents.map((content, i) => {
        if ("text" in content) {
          const pretty = prettyJson(content.text);
          return (
            <Code
              key={i}
              as="pre"
              variant="outline"
              display="block"
              p="3"
              width="100%"
              maxH="400px"
              overflow="auto"
              whiteSpace="pre-wrap"
              fontSize="sm"
            >
              {pretty ?? content.text}
            </Code>
          );
        }

        const mime = content.mimeType ?? "application/octet-stream";
        const src = dataUrl(mime, content.blob);
        if (mime.startsWith("image/")) {
          return (
            <Image
              key={i}
              src={src}
              alt={`Resource blob (${mime})`}
              maxH="300px"
              width="fit-content"
              borderRadius="md"
              borderWidth="1px"
            />
          );
        }
        if (mime.startsWith("audio/")) {
          return (
            <audio key={i} controls src={src} style={{ width: "100%" }} />
          );
        }
        return (
          <Text key={i} fontSize="sm" color="fg.muted">
            Binary resource ({mime}, {content.blob.length} base64 chars)
          </Text>
        );
      })}
    </VStack>
  );
}
