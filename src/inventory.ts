import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { env } from "./config/env.ts";

export type Uso = {
  /** "npm:hono" ou "action:actions/checkout" */
  chave: string;
  tipo: "npm" | "action";
  nome: string;
  /** Em quantos repos seus aparece. */
  repos: number;
  /** Versão declarada mais comum (como está no arquivo). */
  versao: string;
};

const IGNORAR = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "vendor",
  ".next",
  "target",
]);

/**
 * Varre os repos clonados e monta a watchlist do que você REALMENTE usa,
 * ordenada por número de repos. Sem rede.
 */
export function inventariar(): Uso[] {
  const contagem = new Map<string, { tipo: Uso["tipo"]; nome: string; repos: Set<string>; versoes: string[] }>();

  for (const repo of listarRepos(env.watchDir)) {
    const pkg = join(repo, "package.json");
    if (existe(pkg)) coletarNpm(pkg, repo, contagem);
    const wf = join(repo, ".github", "workflows");
    if (existe(wf)) coletarActions(wf, repo, contagem);
  }

  return [...contagem.entries()]
    .map(([chave, v]) => ({
      chave,
      tipo: v.tipo,
      nome: v.nome,
      repos: v.repos.size,
      versao: maisComum(v.versoes),
    }))
    .sort((a, b) => b.repos - a.repos)
    .slice(0, env.watchTop);
}

function listarRepos(raiz: string): string[] {
  const out: string[] = [];
  const andar = (dir: string, nivel: number) => {
    if (nivel > env.scanDepth) return;
    let entradas: string[];
    try {
      entradas = readdirSync(dir);
    } catch {
      return;
    }
    if (entradas.includes(".git")) {
      out.push(dir);
      return; // não desce em submódulo/monorepo interno
    }
    for (const e of entradas) {
      if (IGNORAR.has(e) || e.startsWith(".")) continue;
      const p = join(dir, e);
      if (ehDir(p)) andar(p, nivel + 1);
    }
  };
  andar(raiz, 0);
  return out;
}

function coletarNpm(
  arquivo: string,
  repo: string,
  contagem: Map<string, { tipo: Uso["tipo"]; nome: string; repos: Set<string>; versoes: string[] }>,
): void {
  let json: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    json = JSON.parse(readFileSync(arquivo, "utf8"));
  } catch {
    return; // package.json quebrado não derruba o inventário
  }
  for (const [nome, versao] of Object.entries({
    ...json.dependencies,
    ...json.devDependencies,
  })) {
    if (typeof versao !== "string" || /^(file|link|workspace|git)/.test(versao)) continue;
    registrar(contagem, `npm:${nome}`, "npm", nome, repo, versao);
  }
}

function coletarActions(
  dir: string,
  repo: string,
  contagem: Map<string, { tipo: Uso["tipo"]; nome: string; repos: Set<string>; versoes: string[] }>,
): void {
  let arquivos: string[];
  try {
    arquivos = readdirSync(dir).filter((f) => /\.ya?ml$/i.test(f));
  } catch {
    return;
  }
  for (const f of arquivos) {
    let conteudo: string;
    try {
      conteudo = readFileSync(join(dir, f), "utf8");
    } catch {
      continue;
    }
    for (const m of conteudo.matchAll(/uses:\s*([\w.-]+\/[\w.-]+)@([\w.\-+/]+)/g)) {
      const nome = m[1];
      const versao = m[2];
      if (!nome || !versao) continue;
      registrar(contagem, `action:${nome}`, "action", nome, repo, versao);
    }
  }
}

function registrar(
  contagem: Map<string, { tipo: Uso["tipo"]; nome: string; repos: Set<string>; versoes: string[] }>,
  chave: string,
  tipo: Uso["tipo"],
  nome: string,
  repo: string,
  versao: string,
): void {
  const atual = contagem.get(chave) ?? { tipo, nome, repos: new Set<string>(), versoes: [] };
  atual.repos.add(repo);
  atual.versoes.push(versao);
  contagem.set(chave, atual);
}

function maisComum(vs: string[]): string {
  const c = new Map<string, number>();
  for (const v of vs) c.set(v, (c.get(v) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

const existe = (p: string) => {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
};

const ehDir = (p: string) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};
