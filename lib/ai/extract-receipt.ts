import Anthropic from "@anthropic-ai/sdk";
import { EXTRACT_RECEIPT_TOOL, ReceiptExtractionSchema, type ReceiptExtraction } from "./schema";
import { SYSTEM_PROMPT, USER_INSTRUCTION } from "./prompts";

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export interface ExtractInput {
  base64: string;
  mediaType: ImageMediaType | string;
  model?: string;
}

export interface ExtractResult {
  data: ReceiptExtraction;
  model: string;
  processing_ms: number;
  usage: { input_tokens: number; output_tokens: number };
  raw_tool_input: unknown;
}

const DEFAULT_MODEL = process.env.SCANBOOK_PRIMARY_MODEL || "claude-sonnet-4-6";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    _client = new Anthropic();
  }
  return _client;
}

function normalizeMediaType(t: string): ImageMediaType {
  const lower = t.toLowerCase();
  if (lower === "image/jpg") return "image/jpeg";
  if (lower === "image/jpeg" || lower === "image/png" || lower === "image/webp" || lower === "image/gif") {
    return lower;
  }
  return "image/jpeg";
}

export async function extractReceipt(input: ExtractInput): Promise<ExtractResult> {
  const model = input.model || DEFAULT_MODEL;
  const startedAt = Date.now();

  const response = await client().messages.create({
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [EXTRACT_RECEIPT_TOOL as unknown as Anthropic.Messages.Tool],
    tool_choice: { type: "tool", name: EXTRACT_RECEIPT_TOOL.name },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: normalizeMediaType(input.mediaType),
              data: input.base64,
            },
          },
          { type: "text", text: USER_INSTRUCTION },
        ],
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) {
    throw new Error("Model did not produce a tool_use block. stop_reason=" + response.stop_reason);
  }

  const parsed = ReceiptExtractionSchema.parse(toolUse.input);

  return {
    data: parsed,
    model: response.model,
    processing_ms: Date.now() - startedAt,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
    raw_tool_input: toolUse.input,
  };
}
