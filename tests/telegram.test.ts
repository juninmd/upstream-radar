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
