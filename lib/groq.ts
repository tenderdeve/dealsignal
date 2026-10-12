// Minimal Groq client (OpenAI-compatible). The free tier allows ~8k tokens per
// minute *per model*, so when one model is rate-limited we move to the next
// one, and only wait once every model is busy.

const URL = "https://api.groq.com/openai/v1/chat/completions";

export const aiEnabled = () => Boolean(process.env.GROQ_API_KEY);

const models = () => [
  ...new Set([process.env.GROQ_MODEL || "openai/gpt-oss-20b", "qwen/qwen3.8-27b", "openai/gpt-oss-120b"]),
];

export async function chat(system: string, user: string, opts: { json?: boolean; maxTokens?: number } = {}) {
  if (!aiEnabled()) return null;
  const list = models();
  for (let attempt = 0; attempt < list.length * 2; attempt++) {
    const model = list[attempt % list.length];
    const res = await fetch(URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        max_completion_tokens: opts.maxTokens ?? 600,
        ...(model.startsWith("openai/gpt-oss") && { reasoning_effort: "low" }),
        ...(opts.json && { response_format: { type: "json_object" } }),
      }),
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    if (!res) return null;
    if (res.status === 429) {
      // Every model tried once and all busy: wait before the second round.
      const last = attempt === list.length * 2 - 1;
      if (!last && (attempt + 1) % list.length === 0) {
        const wait = Math.min(Number(res.headers.get("retry-after")) || 5, 20);
        await new Promise((r) => setTimeout(r, wait * 1000));
      }
      continue;
    }
    if (!res.ok) continue;
    const data = await res.json().catch(() => null);
    const text = (data?.choices?.[0]?.message?.content as string | undefined)?.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (text) return text;
  }
  return null;
}
