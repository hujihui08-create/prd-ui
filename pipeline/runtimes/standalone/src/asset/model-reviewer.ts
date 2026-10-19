import {
  AssetReviewVerdictSchema,
  buildReviewPrompt,
  type AssetReviewVerdict,
} from "@prd-ui/asset-review";
import type { AssetReviewerInput, AssetReviewerPort } from "@prd-ui/asset-review";

export interface ModelHttpResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  }
) => Promise<ModelHttpResponse>;

export interface ModelReviewerOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetch?: FetchLike;
  timeoutMs?: number;
}

function stripFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

/**
 * Optional standalone model reviewer. The real asset review path is dsh; this
 * exists so offline/CI runs can use an OpenAI-compatible vision endpoint with
 * the same core prompt and schema.
 */
export class ModelReviewer implements AssetReviewerPort {
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(private readonly options: ModelReviewerOptions) {
    this.fetchImpl = options.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async review(input: AssetReviewerInput): Promise<AssetReviewVerdict> {
    if (!this.options.apiKey) {
      throw new Error("CONFIGURATION_ERROR: PRD_UI_VISION_API_KEY is not set");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(
        `${this.options.baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.options.apiKey}`,
          },
          body: JSON.stringify({
            model: this.options.model,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: "You are an independent asset reviewer. Return only the requested JSON object.",
              },
              { role: "user", content: buildReviewPrompt(input) },
            ],
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`MODEL_HTTP_ERROR ${response.status}: ${await response.text()}`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim().length === 0) {
        throw new Error("MODEL_EMPTY_RESPONSE: no assistant content");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(stripFence(content)) as unknown;
      } catch {
        throw new Error("MODEL_INVALID_JSON: reviewer did not return JSON");
      }
      return AssetReviewVerdictSchema.parse(parsed);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function modelReviewerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: FetchLike
): ModelReviewer {
  const apiKey = env.PRD_UI_VISION_API_KEY;
  if (!apiKey) {
    throw new Error("CONFIGURATION_ERROR: PRD_UI_VISION_API_KEY is not set");
  }
  return new ModelReviewer({
    apiKey,
    baseUrl: env.PRD_UI_VISION_BASE_URL ?? "https://api.openai.com/v1",
    model: env.PRD_UI_VISION_MODEL ?? "gpt-4o-mini",
    ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
  });
}
