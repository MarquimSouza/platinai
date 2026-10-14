import { callGroq, isGroqConfigured } from "@/lib/groq"

type GuideRequest = {
  gameName: string
  achievementName: string
  achievementDescription: string
  searchContext: string
}

type GuideResult = {
  pt: string
  en: string
  sufficient: boolean
}

// Erro com o status HTTP da API, para a rota decidir a mensagem certa pro usuário.
export class GeminiError extends Error {
  status: number
  constructor(status: number, body: string) {
    super(`Erro na API do Gemini (${status}): ${body}`)
    this.name = "GeminiError"
    this.status = status
  }
  // 503 = sobrecarga do servidor, 429 = limite de taxa (RPM) — ambos temporários
  get isBusy(): boolean {
    return this.status === 503 || this.status === 429
  }
}

// Retentativa só para erros temporários (503/429). Cada retentativa conta como
// mais uma requisição no RPM do tier grátis, por isso poucas e com delay.
// Se o fallback (Groq) está configurado, não retenta: cai direto nele, mais rápido e sem gastar RPM.
const MAX_RETRIES = 1
const RETRY_DELAY_MS = 2000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// O Gemini às vezes devolve "false" como string em vez de booleano puro —
// essa função normaliza os dois formatos. Valor ausente/inesperado assume true
// (comportamento anterior a essa checagem existir).
function parseSufficient(value: unknown): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "string") return value.trim().toLowerCase() !== "false"
  return true
}

// Monta o prompt (compartilhado entre Gemini e Groq, pra os dois seguirem as mesmas regras)
function buildPrompt({
  gameName,
  achievementName,
  achievementDescription,
  searchContext,
}: GuideRequest): string {
  return `Você é um assistente especializado em guias de conquistas de jogos.
Abaixo estão trechos de páginas da web pesquisadas sobre esta conquista. Use SOMENTE essas informações (não invente nada que não esteja nelas).

Jogo: ${gameName}
Conquista: ${achievementName}
Descrição oficial: ${achievementDescription}

--- CONTEÚDO PESQUISADO NA WEB ---
${searchContext}
--- FIM DO CONTEÚDO ---

Escreva um guia curto e prático (no máximo 5-6 frases, direto ao ponto, com passos práticos) em DUAS versões: uma em português e uma em inglês, com o MESMO conteúdo nas duas, apenas traduzido.

Além do texto, avalie você mesmo se o conteúdo pesquisado foi suficiente para dar passos práticos e específicos (não apenas título/dados genéricos do jogo). Se não foi suficiente, ainda assim escreva nas duas versões uma frase curta dizendo isso, e marque "sufficient": false.

Responda ESTRITAMENTE em JSON válido, sem markdown, sem \`\`\`, no formato exato:
{"pt": "texto em português aqui", "en": "text in english here", "sufficient": true}
(o campo "sufficient" é um booleano — true ou false SEM aspas, nunca como texto "true"/"false")`
}

// Chama o Gemini (com retry em 503/429) e devolve o texto cru da resposta
async function callGemini(prompt: string, maxRetries: number): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  let res: Response | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey!,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    )

    if (res.ok) break

    const err = new GeminiError(res.status, await res.text())
    // Só vale tentar de novo se o erro é temporário e ainda restam tentativas
    if (!err.isBusy || attempt === maxRetries) throw err

    await sleep(RETRY_DELAY_MS)
  }

  const data = await res!.json()
  return data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? ""
}

// Gemini: tolerante — se não vier JSON limpo, usa o texto cru (comportamento original).
function parseGeminiOutput(rawText: string): GuideResult {
  const cleaned = rawText.replace(/```json|```/g, "").trim()

  try {
    const parsed = JSON.parse(cleaned)
    return {
      pt: parsed.pt ?? "Não foi possível gerar um guia para esta conquista.",
      en: parsed.en ?? "Could not generate a guide for this achievement.",
      // Se o Gemini não mandar o campo por algum motivo, assume true (comportamento anterior à essa mudança)
      sufficient: parseSufficient(parsed.sufficient),
    }
  } catch {
    // Se o Gemini não devolver JSON limpo por algum motivo, usa o texto cru como fallback nas duas versões
    return {
      pt: rawText || "Não foi possível gerar um guia para esta conquista.",
      en: rawText || "Could not generate a guide for this achievement.",
      sufficient: true,
    }
  }
}

// Groq: estrito — modelo menor, então NÃO salvamos texto cru no cache. Sem JSON válido
// com pt e en preenchidos, lança erro (e o usuário vê "IA ocupada" em vez de lixo salvo).
function parseGroqOutput(rawText: string): GuideResult {
  const cleaned = rawText.replace(/```json|```/g, "").trim()
  const parsed = JSON.parse(cleaned)
  if (typeof parsed.pt !== "string" || !parsed.pt.trim() || typeof parsed.en !== "string" || !parsed.en.trim()) {
    throw new Error("Groq devolveu JSON sem os campos pt/en")
  }
  return { pt: parsed.pt, en: parsed.en, sufficient: parseSufficient(parsed.sufficient) }
}

export async function generateAchievementGuide(req: GuideRequest): Promise<GuideResult> {
  const prompt = buildPrompt(req)
  const hasFallback = isGroqConfigured()

  try {
    return parseGeminiOutput(await callGemini(prompt, hasFallback ? 0 : MAX_RETRIES))
  } catch (geminiErr) {
    if (!hasFallback) throw geminiErr

    console.warn("[ai] Gemini falhou, tentando Groq:", (geminiErr as Error).message)
    try {
      const result = parseGroqOutput(await callGroq(prompt))
      console.log("[ai] guia gerado pelo Groq (fallback)")
      return result
    } catch (groqErr) {
      console.error("[ai] Groq também falhou:", (groqErr as Error).message)
      // Mantém o erro original do Gemini: a rota decide a mensagem pelo status dele (503/429 -> "IA ocupada")
      throw geminiErr
    }
  }
}
