import type {
  ElicitRequest,
  ElicitRequestFormParams,
  ElicitResult,
} from "@modelcontextprotocol/sdk/types.js";

export type ElicitContent = Record<
  string,
  string | number | boolean | string[]
>;

export interface PendingElicitation {
  id: number;
  params: ElicitRequestFormParams;
  resolve: (result: ElicitResult) => void;
}

// Bridge between the SDK's server->client elicitation requests and the React
// UI: the SDK handler calls presentElicitation(), which stores the request and
// returns a promise; the ElicitationDialog renders it and calls
// respondElicitation() to resolve that promise with the user's answer.
let pending: PendingElicitation | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

export function subscribeElicitation(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPendingElicitation(): PendingElicitation | null {
  return pending;
}

/**
 * Called by the SDK's ElicitRequest handler. For form mode this pauses until
 * the user answers (or the request is cancelled); URL mode just opens the URL.
 */
export function presentElicitation(
  request: ElicitRequest,
): Promise<ElicitResult> {
  const params = request.params;
  if (params.mode === "url") {
    window.open(params.url, "_blank", "noopener");
    return Promise.resolve({ action: "accept", content: {} });
  }
  return new Promise<ElicitResult>((resolve) => {
    pending = { id: nextId++, params, resolve };
    emit();
  });
}

export function respondElicitation(
  action: "accept" | "decline" | "cancel",
  content: ElicitContent = {},
): void {
  const current = pending;
  pending = null;
  emit();
  current?.resolve({ action, content });
}

/** The user dismissed the dialog without choosing. */
export function cancelElicitation(): void {
  respondElicitation("cancel");
}
