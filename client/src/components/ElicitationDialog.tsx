import { useSyncExternalStore, useState } from "react";
import {
  Button,
  Checkbox,
  Dialog,
  Field,
  HStack,
  Input,
  NativeSelect,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  cancelElicitation,
  getPendingElicitation,
  respondElicitation,
  subscribeElicitation,
  type ElicitContent,
  type PendingElicitation,
} from "../mcp/elicitation";

interface ElicitProp {
  type?: string;
  title?: string;
  description?: string;
  enum?: string[];
  enumNames?: string[];
  oneOf?: Array<{ const?: string; title?: string }>;
  items?: {
    enum?: string[];
    anyOf?: Array<{ const?: string; title?: string }>;
  };
  format?: string;
  minimum?: number;
  maximum?: number;
  default?: unknown;
}

function defaultValue(prop: ElicitProp): ElicitContent[string] {
  if (prop.default !== undefined) return prop.default as ElicitContent[string];
  if (prop.type === "array") return [];
  if (prop.type === "boolean") return false;
  if (prop.type === "number" || prop.type === "integer") return "";
  if (prop.enum && prop.enum.length > 0) return prop.enum[0];
  if (prop.oneOf && prop.oneOf.length > 0) {
    return prop.oneOf[0].const ?? "";
  }
  return "";
}

/** Modal shown when the server pauses a tool call to ask the user a question. */
export function ElicitationDialog() {
  const pending = useSyncExternalStore(
    subscribeElicitation,
    getPendingElicitation,
  );
  if (!pending) return null;
  return <ElicitationForm key={pending.id} pending={pending} />;
}

function ElicitationForm({ pending }: { pending: PendingElicitation }) {
  const params = pending.params;
  const properties = (params.requestedSchema.properties ??
    {}) as Record<string, ElicitProp>;
  const required = new Set(params.requestedSchema.required ?? []);

  const [values, setValues] = useState<ElicitContent>(() => {
    const init: ElicitContent = {};
    for (const [key, prop] of Object.entries(properties)) {
      init[key] = defaultValue(prop);
    }
    return init;
  });

  const set = (key: string) => (value: ElicitContent[string]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const submit = () => {
    // Drop empty optional fields; keep required ones even if empty (the
    // server will reject them if needed).
    const content: ElicitContent = {};
    for (const [key, value] of Object.entries(values)) {
      const isEmpty =
        value === "" || (Array.isArray(value) && value.length === 0);
      if (!isEmpty || required.has(key)) content[key] = value;
    }
    respondElicitation("accept", content);
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(details) => {
        if (!details.open) cancelElicitation();
      }}
    >
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>User input required</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <VStack align="stretch" gap="4">
              <Text>{params.message}</Text>
              {Object.entries(properties).map(([key, prop]) => (
                <Field.Root key={key} required={required.has(key)}>
                  <Field.Label>
                    {prop.title ?? key}
                    {prop.description && (
                      <Text
                        as="span"
                        color="fg.muted"
                        fontSize="xs"
                        ml={1}
                      >
                        — {prop.description}
                      </Text>
                    )}
                  </Field.Label>
                  <ElicitField
                    prop={prop}
                    value={values[key]}
                    onChange={set(key)}
                  />
                </Field.Root>
              ))}
            </VStack>
          </Dialog.Body>
          <Dialog.Footer>
            <HStack gap="2">
              <Button
                variant="ghost"
                onClick={() => respondElicitation("decline")}
              >
                Decline
              </Button>
              <Button colorPalette="blue" onClick={submit}>
                Submit
              </Button>
            </HStack>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}

function ElicitField({
  prop,
  value,
  onChange,
}: {
  prop: ElicitProp;
  value: ElicitContent[string];
  onChange: (value: ElicitContent[string]) => void;
}) {
  // Multi-select (array of enums/consts) -> checkboxes.
  if (prop.type === "array") {
    const options = prop.items?.enum?.map((v) => ({
      value: v,
      label: v,
    })) ?? prop.items?.anyOf?.map((o) => ({
      value: o.const ?? o.title ?? "",
      label: o.title ?? o.const ?? "",
    })) ?? [];
    const selected = (value as string[]) ?? [];
    return (
      <VStack align="stretch" gap="2">
        {options.map((option) => (
          <Checkbox.Root
            key={option.value}
            checked={selected.includes(option.value)}
            onCheckedChange={(details: { checked: boolean | "indeterminate" }) =>
              onChange(
                details.checked === true
                  ? [...selected, option.value]
                  : selected.filter((v) => v !== option.value),
              )
            }
          >
            <Checkbox.Control />
            <Checkbox.Label>{option.label}</Checkbox.Label>
          </Checkbox.Root>
        ))}
      </VStack>
    );
  }

  if (prop.type === "boolean") {
    return (
      <Checkbox.Root
        checked={value === true}
        onCheckedChange={(details: { checked: boolean | "indeterminate" }) =>
          onChange(details.checked === true)
        }
      >
        <Checkbox.Control />
        <Checkbox.Label>Enabled</Checkbox.Label>
      </Checkbox.Root>
    );
  }

  if (prop.type === "number" || prop.type === "integer") {
    return (
      <Input
        type="number"
        value={String(value ?? "")}
        onChange={(e) =>
          onChange(e.target.value === "" ? "" : Number(e.target.value))
        }
      />
    );
  }

  const enumOptions = prop.enum;
  const oneOfOptions = prop.oneOf;
  if (enumOptions || oneOfOptions) {
    const options = enumOptions
      ? enumOptions.map((v, i) => ({
          value: v,
          label: prop.enumNames?.[i] ?? v,
        }))
      : (oneOfOptions ?? []).map((o) => ({
          value: o.const ?? o.title ?? "",
          label: o.title ?? o.const ?? "",
        }));
    return (
      <NativeSelect.Root>
        <NativeSelect.Field
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    );
  }

  const inputType =
    prop.format === "email"
      ? "email"
      : prop.format === "uri"
        ? "url"
        : prop.format === "date"
          ? "date"
          : "text";
  return (
    <Input
      type={inputType}
      value={String(value ?? "")}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
