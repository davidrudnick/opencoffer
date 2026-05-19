import assert from "node:assert/strict";
import { buildCredentialUpdateValues } from "./settings";

{
  const result = buildCredentialUpdateValues({
    body: {
      label: "Local Hermes",
      provider: "openai-compat",
      baseUrl: "http://localhost:7777/v1",
      model: "hermes-2",
      apiKey: "",
    },
    existing: {
      provider: "openai-compat",
      baseUrl: "http://localhost:7777/v1",
    },
    encryptSecret: (value) => `encrypted:${value}`,
  });

  assert.equal(result.error, null);
  assert.deepEqual(result.values, {
    label: "Local Hermes",
    provider: "openai-compat",
    baseUrl: "http://localhost:7777/v1",
    model: "hermes-2",
  });
}

{
  const result = buildCredentialUpdateValues({
    body: {
      apiKey: "sk-rotated",
    },
    existing: {
      provider: "openai-compat",
      baseUrl: "https://api.openai.com/v1",
    },
    encryptSecret: (value) => `encrypted:${value}`,
  });

  assert.equal(result.error, null);
  assert.equal(result.values.apiKeyCipher, "encrypted:sk-rotated");
}

{
  const result = buildCredentialUpdateValues({
    body: {
      provider: "chatgpt-subscription",
    },
    existing: {
      provider: "openai-compat",
      baseUrl: "https://api.openai.com/v1",
    },
    encryptSecret: (value) => `encrypted:${value}`,
  });

  assert.equal(result.error, "Changing to ChatGPT subscription requires a fresh auth.json secret.");
}

console.log("llm settings update helpers passed");
