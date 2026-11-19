import { afterEach, describe, expect, it } from "bun:test";
import { cleanReleaseNotes, repoDoNpm } from "../src/releases.ts";

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
