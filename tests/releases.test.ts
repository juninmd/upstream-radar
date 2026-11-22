import { afterEach, describe, expect, it } from "bun:test";
import { cleanReleaseNotes, releaseDoPacote, repoDoNpm } from "../src/releases.ts";

describe("cleanReleaseNotes", () => {
  it("converte notas com HTML para Markdown limpo", () => {
    const raw = `
      <div>
        <h3>v2.0.0 Release Notes</h3>
        <p>This release introduces breaking changes to the auth module.</p>
        <ul>
          <li>Fix memory leak in websocket connection</li>
          <li>Support custom headers in HTTP client</li>
        </ul>
      </div>
    `;
    const res = cleanReleaseNotes(raw);
    expect(res).toContain("v2.0.0 Release Notes");
    expect(res).toContain("breaking changes");
    expect(res).toContain("websocket");
  });

  it("preserva texto simples sem alteração", () => {
    const text = "Fix #123 and update dependencies.";
    expect(cleanReleaseNotes(text)).toBe(text);
  });
});

describe("repoDoNpm", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  const respondWith = (status: number, body: unknown = {}) => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  };

  it("extrai o repo GitHub do manifest", async () => {
    respondWith(200, { repository: { url: "git+https://github.com/honojs/hono.git" } });
    expect(await repoDoNpm("hono")).toBe("honojs/hono");
  });

  it("aceita o atalho do npm (github:owner/repo e owner/repo)", async () => {
    respondWith(200, { repository: "github:colinhacks/zod" });
    expect(await repoDoNpm("zod")).toBe("colinhacks/zod");
    respondWith(200, { repository: "sindresorhus/ky" });
    expect(await repoDoNpm("ky")).toBe("sindresorhus/ky");
  });

  it("cai para a homepage quando o repository não é do GitHub", async () => {
    respondWith(200, { repository: "gitlab:org/pkg", homepage: "https://github.com/org/pkg#readme" });
    expect(await repoDoNpm("pkg")).toBe("org/pkg");
    respondWith(200, { repository: "gitlab:org/pkg" });
    expect(await repoDoNpm("pkg")).toBe("");
  });

  it("404 vira string vazia (pacote sem repo, pode ir para o cache)", async () => {
    respondWith(404);
    expect(await repoDoNpm("nao-existe-xyz")).toBe("");
  });

  it("429 e 5xx jogam erro em vez de virar \"\" e banir o pacote do cache", async () => {
    respondWith(429);
    await expect(repoDoNpm("hono")).rejects.toThrow("npm registry 429");
    respondWith(503);
    await expect(repoDoNpm("hono")).rejects.toThrow("npm registry 503");
  });
});

describe("releaseDoPacote", () => {
  const npm = (nome: string) => ({ tipo: "npm" as const, nome });

  it("tag sem prefixo de pacote vale para o repo", () => {
    expect(releaseDoPacote("v6.1.0", npm("vite"))).toBe(true);
    expect(releaseDoPacote("6.1.0", npm("vite"))).toBe(true);
  });

  it("descarta release de outro pacote do mesmo monorepo", () => {
    expect(releaseDoPacote("create-vite@6.1.0", npm("vite"))).toBe(false);
    expect(releaseDoPacote("@astrojs/react@4.1.0", npm("astro"))).toBe(false);
  });

  it("mantém a release do pacote usado, com ou sem escopo", () => {
    expect(releaseDoPacote("astro@5.1.0", npm("astro"))).toBe(true);
    expect(releaseDoPacote("@astrojs/react@4.1.0", npm("@astrojs/react"))).toBe(true);
    expect(releaseDoPacote("plugin-react@4.3.4", npm("@vitejs/plugin-react"))).toBe(true);
  });

  it("GitHub Action nunca é filtrada", () => {
    expect(releaseDoPacote("checkout@v4", { tipo: "action", nome: "actions/checkout" })).toBe(true);
  });
});
