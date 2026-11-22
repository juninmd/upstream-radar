import { describe, expect, it } from "bun:test";
import { normalizarAnalise } from "../src/digest.ts";

describe("normalizarAnalise", () => {
  it("não quebra com campos de tipo errado vindos da IA", () => {
    const a = normalizarAnalise({ resumo: ["x"], impacto: 3, acao: "agir_agora" }, "v1.2.0");
    expect(a).toEqual({ resumo: "v1.2.0", impacto: "sem leitura da IA — confira as notas.", acao: "agir_agora" });
  });

  it("aceita resposta nula ou que não é objeto", () => {
    expect(normalizarAnalise(null, "n").acao).toBe("agendar");
    expect(normalizarAnalise("texto solto", "n").resumo).toBe("n");
  });

  it("mantém os textos válidos aparados e recusa ação desconhecida", () => {
    const a = normalizarAnalise({ resumo: "  ok  ", impacto: " faça X ", acao: "deletar" }, "n");
    expect(a).toEqual({ resumo: "ok", impacto: "faça X", acao: "agendar" });
  });
});
