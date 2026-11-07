import { env } from "./config/env.ts";
import { jaVisto, repoCache, salvarRepo } from "./db.ts";
import type { Uso } from "./inventory.ts";
import { extractArticleFromHtml } from "@juninmd/digest-kit/core";

export type Release = {
  uso: Uso;
  repo: string;
  tag: string;
  nome: string;
  url: string;
  publicado: string;
  corpo: string;
  /** true se o major da tag for maior que o da versão que você usa. */
  majorNovo: boolean;
};

/** Resolve o repo GitHub do item (com cache) e busca releases inéditas. */
export async function novidades(usos: Uso[]): Promise<Release[]> {
  const out: Release[] = [];
  for (const uso of usos) {
    let repo: string;
    try {
      repo = await resolverRepo(uso);
    } catch (err) {
      console.error(`[repo] ${uso.chave}:`, (err as Error).message);
      continue;
    }
    if (!repo) continue;
    try {
      out.push(...(await buscarReleases(uso, repo)));
    } catch (err) {
      console.error(`[releases] ${repo}:`, (err as Error).message);
    }
  }
  return out.sort((a, b) => b.publicado.localeCompare(a.publicado));
}

async function resolverRepo(uso: Uso): Promise<string> {
  const cache = repoCache(uso.chave);
  if (cache !== null) return cache;
  // GitHub Action já é um repo; só pacote npm precisa de tradução.
  const repo = uso.tipo === "action" ? uso.nome : await repoDoNpm(uso.nome);
  salvarRepo(uso.chave, repo);
  return repo;
}

async function repoDoNpm(pacote: string): Promise<string> {
  // `/latest` devolve o manifest de uma versão só: tem `repository` e evita
  // baixar o documento completo (megabytes em pacotes antigos). O accept
  // abreviado do npm NÃO traz `repository` — por isso não é usado aqui.
  // Só a barra do escopo é escapada; o "@" a rota aceita cru.
  const res = await fetch(
    `https://registry.npmjs.org/${pacote.replace("/", "%2F")}/latest`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!res.ok) return "";
  const json = (await res.json()) as {
    repository?: { url?: string } | string;
    homepage?: string;
  };
  const bruto = urlDe(json.repository) || json.homepage || "";
  const m = bruto.match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git|\/|#|$)/i);
  return m?.[1] ?? "";
}

const urlDe = (r: { url?: string } | string | undefined): string =>
  typeof r === "string" ? r : (r?.url ?? "");

async function buscarReleases(uso: Uso, repo: string): Promise<Release[]> {
  const res = await fetch(
    `https://api.github.com/repos/${repo}/releases?per_page=${env.releasesPorProjeto}`,
    {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "upstream-radar",
        ...(env.githubToken ? { authorization: `Bearer ${env.githubToken}` } : {}),
      },
      signal: AbortSignal.timeout(20000),
    },
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const lista = (await res.json()) as {
    tag_name: string;
    name: string | null;
    html_url: string;
    published_at: string;
    body: string | null;
    draft: boolean;
    prerelease: boolean;
  }[];

  const seuMajor = major(uso.versao);
  return lista
    .filter(
      (r) =>
        !r.draft &&
        !r.prerelease &&
        // Backport de linha antiga (v3.7.0 para quem está no v4) não é novidade.
        major(r.tag_name) >= seuMajor &&
        !jaVisto(uso.chave, r.tag_name),
    )
    .map((r) => ({
      uso,
      repo,
      tag: r.tag_name,
      nome: r.name || r.tag_name,
      url: r.html_url,
      publicado: r.published_at ?? "",
      corpo: cleanReleaseNotes(r.body ?? ""),
      majorNovo: major(r.tag_name) > major(uso.versao),
    }));
}

/** Limpa notas de release que possam conter HTML usando o parser do @juninmd/digest-kit. */
export function cleanReleaseNotes(body: string): string {
  if (!body) return "";
  if (body.includes("<html") || body.includes("<body") || body.includes("<div") || body.includes("<p>")) {
    const extracted = extractArticleFromHtml(body);
    if (extracted?.contentMarkdown) {
      return extracted.contentMarkdown.slice(0, 3000);
    }
  }
  return body.slice(0, 3000);
}

/** Major da string de versão (aceita ^1.2.3, v2, ~3.0). 0 se não der pra ler. */
function major(v: string): number {
  return Number(v.replace(/^[^\d]*/, "").split(".")[0] ?? 0) || 0;
}
