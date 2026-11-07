import { env } from "./config/env.ts";

/** Chat single-shot no LiteLLM do cluster (OpenAI-compatible). Texto puro. */
export async function chat(
  system: string,
  user: string,
  temperature = 0.4,
): Promise<string> {
  const res = await fetch(`${env.litellmBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.litellmKey}`,
    },
    body: JSON.stringify({
      model: env.litellmModel,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature,
    }),
    signal: AbortSignal.timeout(env.aiTimeoutMs),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return json.choices[0]?.message?.content?.trim() ?? "";
}

/**
 * Igual a chat(), mas devolve JSON parseado — ou null se a IA falhar/alucinar.
 * Modelos pequenos (gemma3) cercam com ```json, emitem \u inválido e às vezes
 * aspas simples; tudo isso é saneado antes do parse.
 */
export async function chatJson<T>(
  system: string,
  user: string,
  temperature = 0.2,
): Promise<T | null> {
  const prompt = `${system}\n\nResponda SOMENTE com JSON válido, sem texto antes ou depois.`;
  // Duas tentativas: a 2ª esfria a temperatura, que é onde o modelo pequeno
  // costuma quebrar o JSON. Erro de rede/timeout aborta na hora.
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    let raw: string;
    try {
      raw = await chat(prompt, user, tentativa === 0 ? temperature : 0);
    } catch (err) {
      console.error("[ai]", (err as Error).message);
      return null;
    }
    if (process.env.DEBUG_AI) console.log("[ai] cru:\n", raw);
    const body = sliceJson(raw);
    for (const candidate of body ? [body, sanitize(body)] : []) {
      try {
        return JSON.parse(candidate) as T;
      } catch {}
    }
    console.error(`[ai] JSON inválido (tentativa ${tentativa + 1}/2)`);
  }
  return null;
}

/** Recorta o primeiro objeto/array do texto, ignorando cercas e preâmbulo. */
function sliceJson(raw: string): string {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.search(/[[{]/);
  if (start < 0) return "";
  const open = cleaned[start] as "[" | "{";
  const end = cleaned.lastIndexOf(open === "[" ? "]" : "}");
  return end > start ? cleaned.slice(start, end + 1) : "";
}

/** Escapes \u truncados e aspas simples no lugar de duplas. */
function sanitize(body: string): string {
  return body
    .replace(/\\u(?![0-9a-fA-F]{4})/g, "")
    .replace(/([{,]\s*)'([^']+)'(\s*:)/g, '$1"$2"$3')
    .replace(/(:\s*)'([^']*)'(\s*[,}\]])/g, '$1"$2"$3');
}
