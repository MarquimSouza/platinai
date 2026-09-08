type GuideRequest = {
  gameName: string
  achievementName: string
  achievementDescription: string
  searchContext: string
}

type GuideResult = {
  pt: string
  en: string
}

export async function generateAchievementGuide({
  gameName,
  achievementName,
  achievementDescription,
  searchContext,
}: GuideRequest): Promise<GuideResult> {
  const apiKey = process.env.GEMINI_API_KEY

  const prompt = `Você é um assistente especializado em guias de conquistas de jogos.
Abaixo estão trechos de páginas da web pesquisadas sobre esta conquista. Use SOMENTE essas informações (não invente nada que não esteja nelas).

Jogo: ${gameName}
Conquista: ${achievementName}
Descrição oficial: ${achievementDescription}

--- CONTEÚDO PESQUISADO NA WEB ---
${searchContext}
--- FIM DO CONTEÚDO ---

Escreva um guia curto e prático (no máximo 5-6 frases, direto ao ponto, com passos práticos) em DUAS versões: uma em português e uma em inglês, com o MESMO conteúdo nas duas, apenas traduzido. Se o conteúdo pesquisado não for suficiente pra responder com confiança, diga isso claramente nas duas versões, em vez de inventar.

Responda ESTRITAMENTE em JSON válido, sem markdown, sem \`\`\`, no formato exato:
{"pt": "texto em português aqui", "en": "text in english here"}`

  const res = await fetch(
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

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Erro na API do Gemini: ${errBody}`)
  }

  const data = await res.json()
  const rawText: string =
    data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? ""

  const cleaned = rawText.replace(/```json|```/g, "").trim()

  try {
    const parsed = JSON.parse(cleaned)
    return {
      pt: parsed.pt ?? "Não foi possível gerar um guia para esta conquista.",
      en: parsed.en ?? "Could not generate a guide for this achievement.",
    }
  } catch {
    // Se o Gemini não devolver JSON limpo por algum motivo, usa o texto cru como fallback nas duas versões
    return {
      pt: rawText || "Não foi possível gerar um guia para esta conquista.",
      en: rawText || "Could not generate a guide for this achievement.",
    }
  }
}