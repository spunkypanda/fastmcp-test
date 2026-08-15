import { useState } from "react";
import type { Progress as McpProgress, Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  Box,
  Button,
  Card,
  Checkbox,
  Field,
  HStack,
  Heading,
  Input,
  NativeSelect,
  Progress,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useMcpCall } from "../hooks/useMcpCall";
import { ResultView } from "./ResultView";

interface PropSchema {
  type?: string | string[];
  anyOf?: Array<{ type?: string }>;
  description?: string;
  default?: unknown;
}

interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldConfig {
  field: string;
  options: SelectOption[];
  defaultValue?: string;
}

// Some tools should render a dropdown instead of a free-text input.
// Keyed by tool name; the first option is the default when no explicit
// defaultValue is given.
const SELECT_FIELDS: Record<string, SelectFieldConfig> = {
  get_time: {
    field: "timezone_name",
    defaultValue: "Asia/Kolkata",
    options: [
      { value: "Asia/Kolkata", label: "IST — Asia/Kolkata" },
      { value: "Etc/UTC", label: "UTC" },
      { value: "America/New_York", label: "ET — America/New_York" },
      { value: "America/Los_Angeles", label: "PT — America/Los_Angeles" },
      { value: "Europe/London", label: "GMT/BST — Europe/London" },
      { value: "Europe/Paris", label: "CET — Europe/Paris" },
      { value: "Asia/Dubai", label: "GST — Asia/Dubai" },
      { value: "Asia/Singapore", label: "SGT — Asia/Singapore" },
      { value: "Asia/Tokyo", label: "JST — Asia/Tokyo" },
      { value: "Australia/Sydney", label: "AEST — Australia/Sydney" },
    ],
  },
};

function resolveType(p: PropSchema): "string" | "number" | "boolean" {
  if (p.anyOf?.length) {
    const types = p.anyOf.map((a) => a.type).filter(Boolean);
    if (types.includes("boolean")) return "boolean";
    if (types.includes("number") || types.includes("integer")) return "number";
    return "string";
  }
  if (p.type === "boolean") return "boolean";
  if (p.type === "integer" || p.type === "number") return "number";
  return "string";
}

type FormValues = Record<string, string | number | boolean>;

export function ToolCard({ tool }: { tool: Tool }) {
  const mutation = useMcpCall(tool.name);
  const [progress, setProgress] = useState<McpProgress | null>(null);
  const properties = (tool.inputSchema?.properties ?? {}) as Record<
    string,
    PropSchema
  >;
  const required = new Set(tool.inputSchema?.required ?? []);
  const select = SELECT_FIELDS[tool.name];

  const [values, setValues] = useState<FormValues>(() => {
    const init: FormValues = {};
    for (const [key, prop] of Object.entries(properties)) {
      const t = resolveType(prop);
      if (t === "boolean") {
        init[key] = prop.default === true;
      } else if (select?.field === key) {
        init[key] = select.defaultValue ?? select.options[0]?.value ?? "";
      } else if (prop.default != null) {
        init[key] = String(prop.default);
      } else {
        init[key] = "";
      }
    }
    return init;
  });

  const set = (key: string) => (val: string | number | boolean) =>
    setValues((prev) => ({ ...prev, [key]: val }));

  const submit = () => {
    const args: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(properties)) {
      const t = resolveType(prop);
      const value = values[key];
      if (t === "number") {
        if (value !== "" && value !== undefined && value !== null) {
          args[key] = Number(value);
        }
      } else if (value !== "" && value !== undefined && value !== null) {
        args[key] = value;
      }
    }
    setProgress(null);
    mutation.mutate(
      { args, onProgress: setProgress },
      { onSettled: () => setProgress(null) },
    );
  };

  const percent = progress?.total
    ? Math.min(100, Math.max(0, (progress.progress / progress.total) * 100))
    : 0;

  return (
    <Card.Root>
      <Card.Header>
        <Heading size="md">{tool.name}</Heading>
        <Text color="fg.muted" fontSize="sm">
          {tool.description ?? "No description"}
        </Text>
      </Card.Header>
      <Card.Body>
        <Stack gap="4">
          {Object.entries(properties).length === 0 && (
            <Text fontSize="sm" color="fg.muted">
              This tool takes no arguments.
            </Text>
          )}
          {Object.entries(properties).map(([key, prop]) => {
            const t = resolveType(prop);
            const isSelect = select?.field === key;
            return (
              <Field.Root key={key} required={required.has(key)}>
                <Field.Label>
                  {key}
                  {prop.description && (
                    <Text as="span" color="fg.muted" fontSize="xs" ml={1}>
                      — {prop.description}
                    </Text>
                  )}
                </Field.Label>
                {isSelect ? (
                  <NativeSelect.Root>
                    <NativeSelect.Field
                      value={String(values[key] ?? "")}
                      onChange={(e) => set(key)(e.target.value)}
                    >
                      {select.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                ) : t === "boolean" ? (
                  <Checkbox.Root
                    checked={values[key] === true}
                    onCheckedChange={(d: { checked: boolean | "indeterminate" }) =>
                      set(key)(d.checked === true)
                    }
                  >
                    <Checkbox.Control />
                    <Checkbox.Label>Enabled</Checkbox.Label>
                  </Checkbox.Root>
                ) : (
                  <Input
                    type={t === "number" ? "number" : "text"}
                    value={String(values[key] ?? "")}
                    onChange={(e) => set(key)(e.target.value)}
                    placeholder={
                      prop.default != null ? String(prop.default) : undefined
                    }
                  />
                )}
              </Field.Root>
            );
          })}

          {progress && (
            <Box>
              <HStack justify="space-between" fontSize="xs" color="fg.muted">
                <Text>{progress.message ?? "Working…"}</Text>
                <Text>
                  {progress.total != null
                    ? `${progress.progress}/${progress.total}`
                    : String(progress.progress)}
                </Text>
              </HStack>
              <Progress.Root value={percent} size="sm" mt={1}>
                <Progress.Track>
                  <Progress.Range />
                </Progress.Track>
              </Progress.Root>
            </Box>
          )}

          <HStack gap="3" alignItems="flex-start">
            <Button colorPalette="blue" onClick={submit} loading={mutation.isPending}>
              Call {tool.name}
            </Button>
            {mutation.isError && (
              <Box fontSize="sm" color="fg.error">
                {mutation.error.message}
              </Box>
            )}
          </HStack>

          <ResultView
            result={mutation.data}
            error={mutation.error}
            isPending={mutation.isPending}
          />
        </Stack>
      </Card.Body>
    </Card.Root>
  );
}
