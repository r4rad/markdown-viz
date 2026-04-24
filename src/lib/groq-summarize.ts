// Groq LLM summarization for audio scripts.
// Uses llama-3.1-8b-instant via the Groq API — free tier (30 req/min, 14400/day).
// CORS is enabled on Groq's API for browser requests.

const GROQ_KEY_STORAGE = 'markdown-viz:groq-api-key';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant';

const SYSTEM_PROMPT = `You are a professional narrator writing a concise spoken-word summary of a technical document.

Rules:
- Write exactly 450–550 words of natural, flowing spoken prose — like a knowledgeable colleague explaining the document to a teammate.
- Start directly with the content. Do NOT say "This document", "The author", "In this article", or any meta-introduction.
- Explain the purpose, key ideas, how things work, and why they matter.
- For code snippets, diagrams, or technical flows: describe what they do in plain English. Never read code or URLs aloud.
- Never mention emails, URLs, file paths, or code syntax.
- Use smooth transitions and conversational language. Vary sentence length.
- End with a brief, natural closing that gives the listener a sense of completion.
- Output ONLY the spoken script — no headings, no bullet points, no markdown.`;

export function getGroqApiKey(): string | null {
  return localStorage.getItem(GROQ_KEY_STORAGE);
}

export function setGroqApiKey(key: string): void {
  localStorage.setItem(GROQ_KEY_STORAGE, key.trim());
}

export function clearGroqApiKey(): void {
  localStorage.removeItem(GROQ_KEY_STORAGE);
}

/**
 * Generate a human-quality spoken summary using Groq's LLM.
 * Throws on network or API errors so the caller can fall back to extractive.
 */
export async function generateSummaryWithGroq(
  markdownContent: string,
  apiKey: string,
): Promise<string> {
  // Truncate to ~4000 tokens worth of content to stay within limits
  const content = markdownContent.length > 12000
    ? markdownContent.slice(0, 12000) + '\n\n[Document continues…]'
    : markdownContent;

  const resp = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Please summarize this document for audio narration:\n\n${content}` },
      ],
      max_tokens: 700,
      temperature: 0.65,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`Groq API error ${resp.status}: ${errText}`);
  }

  const data = await resp.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Groq returned empty response');
  return text;
}
