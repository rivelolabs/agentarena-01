/**
 * Thin, dependency-free adapters for Claude, ChatGPT and Gemini. Each call
 * gets a hard timeout so a slow agent can never stall a battle: on timeout
 * the engine treats the agent as having failed (auto-block).
 */
import type { Provider } from "@clashagent/shared";
import { env } from "../env";

export interface LlmRequest {
  provider: Provider;
  model: string;
  apiKey: string;
  system: string;
  user: string;
  maxTokens?: number;
  timeoutMs?: number;
  /** Ask for a JSON object (battle turns). Set false for free-text replies (post-fight reflection). */
  json?: boolean;
}

export interface LlmResponse {
  text: string;
  latencyMs: number;
}

export class LlmError extends Error {
  constructor(
    message: string,
    public kind: "timeout" | "auth" | "rate_limit" | "bad_request" | "upstream"
  ) {
    super(message);
  }
}

async function post(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      const kind = res.status === 401 || res.status === 403 ? "auth" : res.status === 429 ? "rate_limit" : res.status === 400 || res.status === 404 ? "bad_request" : "upstream";
      let msg = text.slice(0, 300);
      try {
        const j = JSON.parse(text);
        msg = j?.error?.message ?? j?.message ?? msg;
      } catch {
        /* keep raw */
      }
      throw new LlmError(`${res.status}: ${msg}`, kind);
    }
    return JSON.parse(text);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new LlmError("Agent took too long to answer", "timeout");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export async function callLlm(req: LlmRequest): Promise<LlmResponse> {
  const started = Date.now();
  const timeout = req.timeoutMs ?? env.LLM_TIMEOUT_MS;
  const maxTokens = req.maxTokens ?? 400;
  const json = req.json !== false;
  let text = "";

  switch (req.provider) {
    case "anthropic": {
      const j = await post(
        "https://api.anthropic.com/v1/messages",
        { "x-api-key": req.apiKey, "anthropic-version": "2023-06-01" },
        {
          model: req.model,
          max_tokens: maxTokens,
          system: req.system,
          messages: [{ role: "user", content: req.user }],
        },
        timeout
      );
      text = (j.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
      break;
    }
    case "openai": {
      const j = await post(
        "https://api.openai.com/v1/chat/completions",
        { authorization: `Bearer ${req.apiKey}` },
        {
          model: req.model,
          max_completion_tokens: maxTokens,
          ...(json ? { response_format: { type: "json_object" } } : {}),
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
        },
        timeout
      );
      text = j.choices?.[0]?.message?.content ?? "";
      break;
    }
    case "gemini": {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:generateContent`;
      const j = await post(
        url,
        { "x-goog-api-key": req.apiKey },
        {
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: "user", parts: [{ text: req.user }] }],
          generationConfig: { maxOutputTokens: maxTokens, ...(json ? { responseMimeType: "application/json" } : {}), temperature: 0.7 },
        },
        timeout
      );
      text = (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("\n");
      break;
    }
    default:
      throw new LlmError(`Unsupported provider ${req.provider}`, "bad_request");
  }
  return { text, latencyMs: Date.now() - started };
}

/** Cheap call used to validate a key + model when an agent is saved. */
export async function verifyKey(provider: Provider, model: string, apiKey: string): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await callLlm({
      provider,
      model,
      apiKey,
      system: 'Reply with the JSON {"action":"block"} and nothing else.',
      user: "ping",
      maxTokens: 40,
      timeoutMs: 15_000,
    });
    return { ok: true, message: `Key works (${r.latencyMs} ms).` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
