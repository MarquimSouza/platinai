// Provedor de IA de reserva (fallback) usado quando o Gemini falha.
// API do Groq é compatível com a da OpenAI. Tier gratuito sem cartão, mas com limites
// próprios (RPM/dia) que mudam com o tempo — confira em console.groq.com/docs/rate-limits.

// Modelo configurável por variável de ambiente (o catálogo do Groq muda com frequência)
const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile"
const GROQ_TIMEOUT_MS = 15000

export function isGroqConfigured(): boolean {
  return !!process.env.GROQ_API_KEY
}

// Devolve o texto cru da resposta (esperado: JSON). Lança Error em qualquer falha.
export async function callGroq(prompt: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error("GROQ_API_KEY ausente")

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 1024,
      // Força JSON válido (o prompt já pede JSON, requisito dessa opção)
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
  })

  if (!res.ok) {
    throw new Error(`Erro na API do Groq (${res.status}): ${await res.text()}`)
  }

  const data = await res.json()
  const text: string = data.choices?.[0]?.message?.content ?? ""
  if (!text.trim()) throw new Error("Groq devolveu resposta vazia")
  return text
}
