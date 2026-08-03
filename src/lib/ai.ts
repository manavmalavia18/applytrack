import { anthropic } from "@ai-sdk/anthropic";

/** Direct Anthropic model id (uses ANTHROPIC_API_KEY). */
export const ANTHROPIC_DRAFT_MODEL = "claude-sonnet-4-5";

/** Fallback when no Anthropic key — routes through Vercel AI Gateway. */
export const GATEWAY_DRAFT_MODEL = "openai/gpt-4o-mini";

export function getDraftModel() {
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      model: anthropic(ANTHROPIC_DRAFT_MODEL),
      modelId: `anthropic/${ANTHROPIC_DRAFT_MODEL}`,
    };
  }
  return {
    model: GATEWAY_DRAFT_MODEL,
    modelId: GATEWAY_DRAFT_MODEL,
  };
}

/** Prefer a clear ANTHROPIC_API_KEY hint over opaque AI Gateway billing errors. */
export function formatDraftAiError(err: unknown): string {
  const message = err instanceof Error ? err.message : "Draft failed";
  const gatewayBilling =
    /credit card|AI Gateway|billing|payment method|spend limit/i.test(message);

  if (gatewayBilling) {
    return (
      "AI drafting needs an Anthropic API key. Set ANTHROPIC_API_KEY " +
      "(from https://console.anthropic.com/ — Claude.ai Pro ≠ API access) " +
      "in .env.local locally and in your Vercel project env. " +
      `(Gateway: ${message})`
    );
  }

  return message;
}
