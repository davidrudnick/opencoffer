import { parseCodexAuthJson } from "@/lib/llm/chatgpt-subscription";

export const LLM_PROVIDERS = ["openai-compat", "anthropic", "chatgpt-subscription"] as const;

export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export type CredentialUpdateBody = {
  label?: string;
  provider?: LlmProvider;
  baseUrl?: string | null;
  model?: string;
  apiKey?: string;
  authJson?: string;
};

export type ExistingCredentialSettings = {
  provider: string;
  baseUrl: string | null;
};

export type CredentialUpdateValues = Partial<{
  label: string;
  provider: LlmProvider;
  baseUrl: string | null;
  model: string;
  apiKeyCipher: string | null;
}>;

export function buildCredentialUpdateValues({
  body,
  existing,
  encryptSecret,
}: {
  body: CredentialUpdateBody;
  existing: ExistingCredentialSettings;
  encryptSecret: (value: string) => string;
}): { values: CredentialUpdateValues; error: string | null } {
  const values: CredentialUpdateValues = {};

  if (body.label !== undefined) {
    const label = body.label.trim();
    if (!label) return { values: {}, error: "Label is required." };
    values.label = label;
  }

  if (body.model !== undefined) {
    const model = body.model.trim();
    if (!model) return { values: {}, error: "Model ID is required." };
    values.model = model;
  }

  if (body.baseUrl !== undefined) {
    values.baseUrl = body.baseUrl?.trim() || null;
  }

  if (body.provider !== undefined) {
    values.provider = body.provider;
  }

  const nextProvider = body.provider ?? (existing.provider as LlmProvider);
  const providerChanged = body.provider !== undefined && body.provider !== existing.provider;
  const apiKey = body.apiKey?.trim() ?? "";
  const authJson = body.authJson?.trim() ?? "";
  const nextBaseUrl = body.baseUrl !== undefined ? body.baseUrl?.trim() || null : existing.baseUrl;

  if (nextProvider === "chatgpt-subscription") {
    if (authJson) {
      try {
        values.apiKeyCipher = encryptSecret(JSON.stringify(parseCodexAuthJson(authJson)));
      } catch (e) {
        return { values: {}, error: e instanceof Error ? e.message : "Invalid auth.json" };
      }
    } else if (providerChanged) {
      return {
        values: {},
        error: "Changing to ChatGPT subscription requires a fresh auth.json secret.",
      };
    }
  } else if (apiKey) {
    values.apiKeyCipher = encryptSecret(apiKey);
  } else if (nextProvider === "anthropic" && providerChanged && !nextBaseUrl) {
    return {
      values: {},
      error: "Anthropic requires either an API key or a custom base URL.",
    };
  }

  if (
    providerChanged &&
    existing.provider === "chatgpt-subscription" &&
    nextProvider !== "chatgpt-subscription" &&
    !apiKey &&
    !nextBaseUrl
  ) {
    return {
      values: {},
      error: "Changing away from ChatGPT subscription requires a fresh API key or local base URL.",
    };
  }

  return { values, error: null };
}
