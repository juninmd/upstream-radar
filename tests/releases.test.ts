import { describe, expect, it } from "bun:test";
import { cleanReleaseNotes } from "../src/releases.ts";

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
