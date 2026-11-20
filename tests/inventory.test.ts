import { describe, expect, it } from "bun:test";
import { actionsDoWorkflow } from "../src/inventory.ts";

describe("actionsDoWorkflow", () => {
  it("lê owner/repo e ref de uma action simples", () => {
    expect(actionsDoWorkflow("      - uses: actions/checkout@v4")).toEqual([["actions/checkout", "v4"]]);
  });

  it("action em subpasta conta para o repo dela", () => {
    expect(actionsDoWorkflow("uses: github/codeql-action/init@v3")).toEqual([["github/codeql-action", "v3"]]);
    expect(actionsDoWorkflow("uses: actions/cache/restore@v4")).toEqual([["actions/cache", "v4"]]);
  });

  it("workflow reutilizável conta para o repo que o hospeda", () => {
    expect(
      actionsDoWorkflow("    uses: juninmd/base-actions/.github/workflows/reusable-pages.yml@main"),
    ).toEqual([["juninmd/base-actions", "main"]]);
  });

  it("aceita uses entre aspas e ignora action local e docker", () => {
    const wf = `
      - uses: "actions/setup-node@v4"
      - uses: ./.github/actions/local
      - uses: docker://alpine:3.20`;
    expect(actionsDoWorkflow(wf)).toEqual([["actions/setup-node", "v4"]]);
  });
});
