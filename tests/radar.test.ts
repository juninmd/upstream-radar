import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

// bun's module mocks outlive this file, so fakes only apply while it runs.
let active = true;
type Fn = (...args: any[]) => any;
const gate = (real: Record<string, unknown>, fakes: Record<string, Fn>) => {
  const out: Record<string, unknown> = { ...real };
  for (const [k, fake] of Object.entries(fakes)) {
    out[k] = (...args: unknown[]) => (active ? fake(...args) : (real[k] as Fn)(...args));
  }
  return out;
};

const uso = { chave: "npm:hono", tipo: "npm" as const, nome: "hono", repos: 3, versao: "^4.0.0" };
const release = {
  uso, repo: "honojs/hono", tag: "v4.7.0", nome: "v4.7.0", url: "https://x/v4.7.0",
  publicado: "2026-11-20T00:00:00Z", corpo: "fix: security", majorNovo: false,
};
const vistos: string[] = [];
let telegramDown = false;

const realInv = { ...(await import("../src/inventory.ts")) };
mock.module("../src/inventory.ts", () => gate(realInv, { inventariar: () => [uso] }));
const realRel = { ...(await import("../src/releases.ts")) };
mock.module("../src/releases.ts", () => gate(realRel, { novidades: async () => [release] }));
const realDb = { ...(await import("../src/db.ts")) };
mock.module("../src/db.ts", () => gate(realDb, {
  primeiraRodada: () => false,
  marcarVisto: (chave: string, tag: string) => { vistos.push(`${chave}@${tag}`); },
}));
const realAi = { ...(await import("../src/ai.ts")) };
mock.module("../src/ai.ts", () => gate(realAi, {
  chatJson: async () => ({ resumo: "corrige CVE", impacto: "atualize", acao: "agir_agora" }),
}));
const realTg = { ...(await import("../src/telegram.ts")) };
mock.module("../src/telegram.ts", () => gate(realTg, {
  sendTelegram: async () => { if (telegramDown) throw new Error("telegram 502"); },
}));

const { radar } = await import("../src/digest.ts");
afterAll(() => { active = false; });

describe("radar", () => {
  beforeEach(() => { vistos.length = 0; });

  it("não marca a release como vista se o digest não foi entregue", async () => {
    telegramDown = true;
    await expect(radar()).rejects.toThrow("telegram 502");
    expect(vistos).toEqual([]);
  });

  it("marca como vista depois de entregar", async () => {
    telegramDown = false;
    await radar();
    expect(vistos).toEqual(["npm:hono@v4.7.0"]);
  });
});
