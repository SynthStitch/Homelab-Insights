/* eslint-env node */
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY?.trim();
const model = process.env.OPENAI_MODEL?.trim() || "gpt-5-mini"; // configured in .env

const openAiClient = apiKey ? new OpenAI({ apiKey }) : null;

export function isAssistantAvailable() {
  return Boolean(openAiClient);
}

function normalizeResponseText(response) {
  if (!response) return "";
  if (response.output?.length) {
    return response.output
      .flatMap((item) => (item.content ? item.content : []))
      .map((contentItem) => contentItem.text || "")
      .join("")
      .trim();
  }
  if (response.choices?.length) {
    return response.choices.map((choice) => choice.message?.content || "").join("\n").trim();
  }
  return response.text ?? "";
}

export async function getAssistantReply({ message, context }) {
  if (!openAiClient) {
    throw new Error("OpenAI assistant is not configured");
  }

  const systemPrompt =
    "You are the Homelab Insights assistant. Provide concise, actionable answers about homelab monitoring, alerts, and infrastructure health. " +
    "If context is provided, reference it. If a question is outside scope, say you do not know.";

  const userPrompt = context
    ? `Context:\n${context}\n\nUser question:\n${message}`
    : message;

  const response = await openAiClient.responses.create({
    model,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const text = normalizeResponseText(response);
  return text || "I could not generate a useful response. Please try again.";
}
