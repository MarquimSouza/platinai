// Provedor de IA de reserva (fallback) usado quando o Gemini falha.
// API do Groq é compatível com a da OpenAI. Tier gratuito sem cartão, mas com limites
// próprios (RPM/dia) que mudam com o tempo — confira em console.groq.com/docs/rate-limits.

// Modelo configurável por variável de ambiente (GROQ_MODEL): o catálogo do Groq muda com frequência.
// O llama-3.3-70b-versatile foi desativado em 16/08/2026 (devolve 404) — o Groq recomenda o gpt-oss-120b.
// Se este modelo também sair do ar, basta trocar GROQ_MODEL no Vercel (sem mexer no código).
// Lista atual: console.groq.com/docs/models | avisos de desativação: console.groq.com/docs/deprecations
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b"
const GROQ_TIMEOUT_MS = 15000

export function isGroqConfigured(): boolean {
  return !!process.env.GROQ_API_KEY
}

// Devolve o texto cru da resposta (esperado: JSON). Lança Error em qualquer falha.
export async function callGroq(prompt: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error("GROQ_API_KEY ausente")

  const model = process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      // Modelos de raciocínio (gpt-oss) gastam parte desse limite "pensando" antes de responder;
      // com pouco espaço a resposta pode vir vazia. Esforço baixo + limite folgado evita isso.
      max_tokens: 2048,
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
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
