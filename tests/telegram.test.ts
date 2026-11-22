import { describe, expect, it } from "bun:test";
import { split } from "../src/telegram.ts";

describe("split", () => {
  it("não divide texto curto", () => {
    expect(split("oi", 10)).toEqual(["oi"]);
  });

  it("quebra em limites de linha sem passar do máximo", () => {
    const chunks = split("aaaa\nbbbb\ncccc", 10);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(10);
    expect(chunks.join("").replace(/\n/g, "")).toBe("aaaabbbbcccc");
  });

  it("corta linha maior que o máximo e nunca emite bloco vazio", () => {
    const chunks = split("x".repeat(25), 10);
    for (const c of chunks) {
      expect(c.length).toBeGreaterThan(0);
      expect(c.length).toBeLessThanOrEqual(10);
    }
    expect(chunks.join("").replace(/\n/g, "")).toBe("x".repeat(25));
  });
});

describe("sendTelegram", () => {
  it("lança quando o Telegram recusa, para quem chama não marcar como entregue", async () => {
    const { env } = await import("../src/config/env.ts");
    const { sendTelegram } = await import("../src/telegram.ts");
    const salvo = { token: env.telegramToken, ids: env.telegramChatIds, fetch: globalThis.fetch };
    env.telegramToken = "t";
    env.telegramChatIds = ["1"];
    globalThis.fetch = (async () => new Response("bad gateway", { status: 502 })) as unknown as typeof fetch;
    try {
      await expect(sendTelegram("oi")).rejects.toThrow("1 envio(s) falharam");
    } finally {
      env.telegramToken = salvo.token;
      env.telegramChatIds = salvo.ids;
      globalThis.fetch = salvo.fetch;
    }
  });
});
