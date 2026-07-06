"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, Th, Td, Tr, Thead } from "@/components/DataTable";
import { Plus, Check, Pencil, Save, X } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";

type Cred = {
  id: string;
  label: string;
  provider: string;
  model: string;
  baseUrl: string | null;
  isDefault: boolean;
  useForAnalysis: boolean;
  createdAt: string;
};

const PRESETS = [
  // ChatGPT Plus/Pro subscription — use it instead of API credits
  { label: "ChatGPT Plus/Pro · GPT-5.5", provider: "chatgpt-subscription", baseUrl: "", model: "gpt-5.5" },
  { label: "ChatGPT Plus/Pro · GPT-5.4", provider: "chatgpt-subscription", baseUrl: "", model: "gpt-5.4" },
  { label: "ChatGPT Plus/Pro · GPT-5.4-mini", provider: "chatgpt-subscription", baseUrl: "", model: "gpt-5.4-mini" },
  // OpenAI API with a paid sk-… key
  { label: "OpenAI · GPT-5.5", provider: "openai-compat", baseUrl: "https://api.openai.com/v1", model: "gpt-5.5" },
  { label: "OpenAI · GPT-5.4", provider: "openai-compat", baseUrl: "https://api.openai.com/v1", model: "gpt-5.4" },
  { label: "OpenAI · GPT-5.4-mini", provider: "openai-compat", baseUrl: "https://api.openai.com/v1", model: "gpt-5.4-mini" },
  // Anthropic
  { label: "Anthropic · Opus 4.7", provider: "anthropic", baseUrl: "", model: "claude-opus-4-7" },
  { label: "Anthropic · Sonnet 4.6", provider: "anthropic", baseUrl: "", model: "claude-sonnet-4-6" },
  { label: "Anthropic · Haiku 4.5", provider: "anthropic", baseUrl: "", model: "claude-haiku-4-5-20251001" },
  // Open & local
  { label: "Ollama · llama3.3", provider: "openai-compat", baseUrl: "http://localhost:11434/v1", model: "llama3.3" },
  { label: "Groq · llama-3.3-70b", provider: "openai-compat", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  { label: "Together · DeepSeek-V3", provider: "openai-compat", baseUrl: "https://api.together.xyz/v1", model: "deepseek-ai/DeepSeek-V3" },
  { label: "OpenRouter · auto", provider: "openai-compat", baseUrl: "https://openrouter.ai/api/v1", model: "openrouter/auto" },
  { label: "Hermes (self-hosted)", provider: "openai-compat", baseUrl: "http://localhost:7777/v1", model: "hermes" },
];

export function LlmClient({ initial }: { initial: Cred[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [creds, setCreds] = useState(initial);
  const [form, setForm] = useState({
    label: "",
    provider: "openai-compat",
    baseUrl: "",
    model: "",
    apiKey: "",
    authJson: "",
    isDefault: creds.length === 0,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    label: "",
    provider: "openai-compat",
    baseUrl: "",
    model: "",
    apiKey: "",
    authJson: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setForm((f) => ({
      ...f,
      label: p.label,
      provider: p.provider,
      baseUrl: p.baseUrl,
      model: p.model,
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const r = await fetch("/api/settings/llm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!r.ok) {
      setErr((await r.json()).error ?? "Failed");
      return;
    }
    const created = await r.json();
    setCreds((cs) => [...cs, created]);
    setForm({
      label: "",
      provider: "openai-compat",
      baseUrl: "",
      model: "",
      apiKey: "",
      authJson: "",
      isDefault: false,
    });
    router.refresh();
  };

  const startEdit = (c: Cred) => {
    setErr(null);
    setEditingId(c.id);
    setEditForm({
      label: c.label,
      provider: c.provider,
      baseUrl: c.baseUrl ?? "",
      model: c.model,
      apiKey: "",
      authJson: "",
    });
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setSavingEdit(true);
    setErr(null);
    const r = await fetch(`/api/settings/llm/${editingId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setSavingEdit(false);
    if (!r.ok) {
      setErr((await r.json()).error ?? "Failed to update model");
      return;
    }
    const updated = await r.json();
    setCreds((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    setEditingId(null);
    setEditForm({
      label: "",
      provider: "openai-compat",
      baseUrl: "",
      model: "",
      apiKey: "",
      authJson: "",
    });
    router.refresh();
  };

  const setDefault = async (id: string) => {
    await fetch(`/api/settings/llm/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    setCreds((cs) => cs.map((c) => ({ ...c, isDefault: c.id === id })));
  };

  const setAnalysis = async (id: string) => {
    await fetch(`/api/settings/llm/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ useForAnalysis: true }),
    });
    setCreds((cs) => cs.map((c) => ({ ...c, useForAnalysis: c.id === id })));
  };

  const del = async (id: string) => {
    const ok = await confirm({
      title: "Delete credential?",
      body: "Delete this credential?",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    await fetch(`/api/settings/llm/${id}`, { method: "DELETE" });
    setCreds((cs) => cs.filter((c) => c.id !== id));
  };

  const test = async (id: string) => {
    setTestResult((t) => ({ ...t, [id]: { ok: false, msg: "…" } }));
    const r = await fetch(`/api/settings/llm/${id}/test`, { method: "POST" });
    const j = await r.json();
    setTestResult((t) => ({
      ...t,
      [id]: j.ok ? { ok: true, msg: "Connected" } : { ok: false, msg: (j.error ?? "").slice(0, 80) },
    }));
  };

  const isChatGPTSub = form.provider === "chatgpt-subscription";
  const isAnthropic = form.provider === "anthropic";

  const baseUrlPlaceholder = isAnthropic
    ? "https://api.anthropic.com (or your proxy)"
    : isChatGPTSub
      ? "https://chatgpt.com/backend-api/codex/v1 (default)"
      : "https://api.openai.com/v1";

  return (
    <div className="space-y-8">
      {/* Existing creds */}
      <section className="card-elevated mfade mfade-1">
        <h2 className="title-l">Your models</h2>
        <p className="body-m mt-1 text-on-surface-variant">
          Keys and tokens are AES-256-GCM encrypted at rest.
        </p>

        <div className="mt-6 -mx-6 -mb-6">
          <DataTable className="rounded-none rounded-b-2xl bg-transparent">
            <Thead>
              <Tr>
                <Th>Label</Th>
                <Th>Provider</Th>
                <Th>Model</Th>
                <Th>Base URL</Th>
                <Th>Chat default</Th>
                <Th>Analysis</Th>
                <Th align="right"></Th>
              </Tr>
            </Thead>
            <tbody>
              {creds.map((c) => (
                <Fragment key={c.id}>
                  <Tr>
                    <Td>{c.label}</Td>
                    <Td mono className="text-on-surface-variant">{c.provider}</Td>
                    <Td mono>{c.model}</Td>
                    <Td mono className="text-xs text-on-surface-variant">{c.baseUrl ?? "—"}</Td>
                    <Td>
                      {c.isDefault ? (
                        <span className="badge badge-primary">
                          <Check size={12} strokeWidth={2.5} />
                          default
                        </span>
                      ) : (
                        <button onClick={() => setDefault(c.id)} className="btn btn-text">
                          Set default
                        </button>
                      )}
                    </Td>
                    <Td>
                      {c.useForAnalysis ? (
                        <span className="badge badge-primary">
                          <Check size={12} strokeWidth={2.5} />
                          analysis
                        </span>
                      ) : (
                        <button
                          onClick={() => setAnalysis(c.id)}
                          className="btn btn-text"
                          title="Use this model for background categorization + chat analysis tools"
                        >
                          Use for analysis
                        </button>
                      )}
                    </Td>
                    <Td align="right">
                      <button onClick={() => startEdit(c)} className="btn btn-text">
                        <Pencil size={14} strokeWidth={2} />
                        Edit
                      </button>
                      <button onClick={() => test(c.id)} className="btn btn-text">
                        Test
                      </button>
                      {testResult[c.id] && (
                        <span
                          className={`body-s ml-2 ${testResult[c.id].ok ? "text-success" : "text-error"}`}
                        >
                          {testResult[c.id].msg}
                        </span>
                      )}
                      <button onClick={() => del(c.id)} className="btn btn-text-error">
                        Delete
                      </button>
                    </Td>
                  </Tr>
                  {editingId === c.id && (
                    <Tr className="bg-surface-container/45 hover:bg-surface-container/45">
                      <Td colSpan={7} className="px-6 py-5">
                        <form onSubmit={saveEdit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div className="tf">
                            <input
                              required
                              value={editForm.label}
                              onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                              placeholder=" "
                              className="tf-input"
                            />
                            <label className="tf-label">Label</label>
                          </div>

                          <div className="tf">
                            <select
                              value={editForm.provider}
                              onChange={(e) => setEditForm({ ...editForm, provider: e.target.value })}
                              className="tf-input appearance-none pr-10"
                            >
                              <option value="openai-compat">OpenAI / OpenAI-compatible</option>
                              <option value="anthropic">Anthropic / Anthropic-compatible</option>
                              <option value="chatgpt-subscription">ChatGPT Plus/Pro subscription</option>
                            </select>
                            <label className="tf-label">Provider</label>
                          </div>

                          <div className="tf">
                            <input
                              required
                              value={editForm.model}
                              onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                              placeholder=" "
                              className="tf-input"
                            />
                            <label className="tf-label">Model ID</label>
                          </div>

                          <div className="tf">
                            <input
                              value={editForm.baseUrl}
                              onChange={(e) => setEditForm({ ...editForm, baseUrl: e.target.value })}
                              placeholder=" "
                              className="tf-input"
                            />
                            <label className="tf-label">Base URL</label>
                          </div>

                          {editForm.provider === "chatgpt-subscription" ? (
                            <div className="md:col-span-2">
                              <div className="tf">
                                <textarea
                                  value={editForm.authJson}
                                  onChange={(e) => setEditForm({ ...editForm, authJson: e.target.value })}
                                  placeholder=" "
                                  rows={5}
                                  className="tf-input h-auto py-3 font-mono text-xs"
                                  style={{ height: "auto", minHeight: 120 }}
                                />
                                <label className="tf-label">New ~/.codex/auth.json</label>
                              </div>
                              <div className="tf-helper">
                                Leave blank to keep the existing encrypted ChatGPT subscription token.
                              </div>
                            </div>
                          ) : (
                            <div className="md:col-span-2">
                              <div className="tf">
                                <input
                                  type="password"
                                  value={editForm.apiKey}
                                  onChange={(e) => setEditForm({ ...editForm, apiKey: e.target.value })}
                                  placeholder=" "
                                  className="tf-input"
                                />
                                <label className="tf-label">New API key</label>
                              </div>
                              <div className="tf-helper">
                                Leave blank to keep the existing encrypted secret. Local endpoints can stay blank.
                              </div>
                            </div>
                          )}

                          {err && <p className="body-s text-error md:col-span-2">{err}</p>}

                          <div className="flex flex-wrap gap-2 md:col-span-2">
                            <button type="submit" disabled={savingEdit} className="btn btn-filled">
                              <Save size={16} strokeWidth={2} />
                              {savingEdit ? "Saving…" : "Save changes"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="btn btn-text"
                            >
                              <X size={16} strokeWidth={2} />
                              Cancel
                            </button>
                          </div>
                        </form>
                      </Td>
                    </Tr>
                  )}
                </Fragment>
              ))}
              {creds.length === 0 && (
                <tr>
                  <td colSpan={7} className="body-m px-4 py-12 text-center text-on-surface-variant">
                    No models yet. Add one below.
                  </td>
                </tr>
              )}
            </tbody>
          </DataTable>
        </div>
      </section>

      {/* Add */}
      <section className="card-elevated mfade mfade-2">
        <h2 className="title-l">Add a model</h2>
        <p className="body-m mt-1 text-on-surface-variant">
          Pick a preset to autofill, or type your own details.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const selected = form.label === p.label && form.model === p.model;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className={selected ? "chip selected" : "chip"}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <form onSubmit={submit} className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="tf">
            <input
              id="label"
              required
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder=" "
              className="tf-input"
            />
            <label htmlFor="label" className="tf-label">
              Label
            </label>
          </div>

          <div className="tf">
            <select
              id="provider"
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
              className="tf-input appearance-none pr-10"
            >
              <option value="openai-compat">OpenAI / OpenAI-compatible</option>
              <option value="anthropic">Anthropic / Anthropic-compatible</option>
              <option value="chatgpt-subscription">ChatGPT Plus/Pro subscription</option>
            </select>
            <label htmlFor="provider" className="tf-label">
              Provider
            </label>
          </div>

          <div className="tf">
            <input
              id="model"
              required
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder=" "
              className="tf-input"
            />
            <label htmlFor="model" className="tf-label">
              Model ID
            </label>
          </div>

          <div>
            <div className="tf">
              <input
                id="baseurl"
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                placeholder=" "
                className="tf-input"
              />
              <label htmlFor="baseurl" className="tf-label">
                Base URL (optional)
              </label>
            </div>
            <div className="tf-helper">{baseUrlPlaceholder}</div>
          </div>

          {!isChatGPTSub && (
            <div className="md:col-span-2">
              <div className="tf">
                <input
                  id="apikey"
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder=" "
                  className="tf-input"
                />
                <label htmlFor="apikey" className="tf-label">
                  API key
                </label>
              </div>
              <div className="tf-helper">Leave blank for local Ollama.</div>
            </div>
          )}

          {isChatGPTSub && (
            <div className="md:col-span-2 space-y-3">
              <div className="rounded-2xl bg-surface-container p-5">
                <div className="title-s">Use your ChatGPT subscription instead of API credits</div>
                <ol className="body-m mt-2 list-decimal pl-5 text-on-surface-variant space-y-1">
                  <li>
                    If you haven&apos;t already:{" "}
                    <code className="font-mono">codex login</code> to refresh the browser flow.
                  </li>
                  <li>
                    Paste the contents of{" "}
                    <code className="font-mono">~/.codex/auth.json</code> below. We store only the
                    refresh + access tokens (AES-256-GCM encrypted) and rotate them automatically.
                  </li>
                  <li>
                    Models: <code className="font-mono">gpt-5.5</code> (recommended),{" "}
                    <code className="font-mono">gpt-5.4</code>,{" "}
                    <code className="font-mono">gpt-5.4-mini</code>. Pro plans also get{" "}
                    <code className="font-mono">gpt-5.3-codex-spark</code>.
                  </li>
                </ol>
              </div>
              <div className="tf">
                <textarea
                  id="authjson"
                  required
                  value={form.authJson}
                  onChange={(e) => setForm({ ...form, authJson: e.target.value })}
                  placeholder=" "
                  rows={8}
                  className="tf-input h-auto py-3 font-mono text-xs"
                  style={{ height: "auto", minHeight: 160 }}
                />
                <label htmlFor="authjson" className="tf-label">
                  ~/.codex/auth.json
                </label>
              </div>
            </div>
          )}

          <label className="flex h-14 items-center gap-3 px-2">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              className="h-5 w-5 accent-[hsl(var(--md-primary))]"
            />
            <span className="body-m text-on-surface">Use as default for chat</span>
          </label>

          {err && <p className="body-s text-error md:col-span-2">{err}</p>}

          <div className="md:col-span-2">
            <button type="submit" className="btn btn-filled">
              <Plus size={18} strokeWidth={2} />
              Save credential
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
