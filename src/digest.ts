import { chatJson } from "./ai.ts";
import { env } from "./config/env.ts";
import { marcarVisto, primeiraRodada } from "./db.ts";
import { inventariar } from "./inventory.ts";
import { novidades, type Release } from "./releases.ts";
import { sendTelegram } from "./telegram.ts";

const SYSTEM = `Você explica release notes para um dev sênior, em pt-BR, sem marketing.
Contexto: ele JÁ usa essa dependência nos projetos dele, na versão informada.
- "resumo": 1-2 frases sobre o que muda de verdade nesta versão.
- "impacto": o que isso significa PARA ELE, dado a versão que ele usa. Se não muda nada, diga.
- "acao": exatamente "agir_agora" (segurança ou breaking que já o afeta),
  "agendar" (vale atualizar, sem pressa) ou "ignorar".
Se as notas não trouxerem nada relevante, use "ignorar" sem inventar importância.
Formato: {"resumo":"","impacto":"","acao":""}`;

type Analise = { resumo: string; impacto: string; acao: string };

const ORDEM: Record<string, number> = { agir_agora: 0, agendar: 1, ignorar: 2 };
const ICONE: Record<string, string> = {
  agir_agora: "🚨",
  agendar: "🗓️",
  ignorar: "💤",
};

/** Monta e publica o radar: inventário local -> releases novas -> leitura da IA. */
export async function radar(): Promise<void> {
  const usos = inventariar();
  if (!usos.length) {
    await sendTelegram(`⚠️ Nenhum repo encontrado em \`${env.watchDir}\`.`);
    return;
  }

  const primeira = primeiraRodada();
  const releases = await novidades(usos);
  // Primeira execução só marca o estado atual: senão o primeiro digest seria um
  // despejo de todo o histórico de releases.
  if (primeira) {
    for (const r of releases) marcarVisto(r.uso.chave, r.tag);
    await sendTelegram(
      `📡 *upstream-radar ligado*\nWatchlist montada com ${usos.length} dependências suas (${releases.length} releases marcadas como já vistas).\n\nTop 5: ${usos
        .slice(0, 5)
        .map((u) => `${u.nome} (${u.repos} repos)`)
        .join(", ")}`,
    );
    return;
  }

  if (!releases.length) {
    console.log("[radar] nada novo");
    return;
  }

  const analisados: (Release & { analise: Analise })[] = [];
  for (const r of releases.slice(0, 20)) {
    const a = await analisar(r);
    marcarVisto(r.uso.chave, r.tag);
    if (a.acao !== "ignorar" || r.majorNovo) analisados.push({ ...r, analise: a });
  }
  if (!analisados.length) {
    console.log(`[radar] ${releases.length} releases, nenhuma relevante`);
    return;
  }

  analisados.sort((a, b) => (ORDEM[a.analise.acao] ?? 3) - (ORDEM[b.analise.acao] ?? 3));
  const blocos = analisados.map((r) => {
    const icone = ICONE[r.analise.acao] ?? "•";
    const major = r.majorNovo ? " ⬆️ *major novo*" : "";
    return `${icone} *${r.uso.nome} ${r.tag}*${major}\n_você usa ${r.uso.versao} em ${r.uso.repos} repo(s)_\n${r.analise.resumo}\n👉 ${r.analise.impacto}\n${r.url}`;
  });

  await sendTelegram(
    `📡 *Upstream radar* — ${analisados.length} novidade(s) que te tocam\n\n${blocos.join("\n\n")}`,
  );
}

async function analisar(r: Release): Promise<Analise> {
  const out = await chatJson<Analise>(
    SYSTEM,
    `Dependência: ${r.uso.nome} (${r.uso.tipo})
Versão que ele usa: ${r.uso.versao} — em ${r.uso.repos} repositório(s)
Nova release: ${r.tag} (${r.nome})

Notas:
${r.corpo || "(release sem notas)"}`,
  );
  const acao = ["agir_agora", "agendar", "ignorar"].includes(out?.acao ?? "")
    ? (out?.acao as string)
    : "agendar";
  return {
    resumo: out?.resumo?.trim() || r.nome,
    impacto: out?.impacto?.trim() || "sem leitura da IA — confira as notas.",
    acao,
  };
}
