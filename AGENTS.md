# AGENTS.md

upstream-radar: a Telegram bot that watches the upstream projects you depend on, tracks their releases, and sends a digest with an AI summary (LiteLLM).

## Stack

- Bun runtime, TypeScript. SQLite through `bun:sqlite` (`DB_PATH`).
- AI summaries through LiteLLM (`LITELLM_*`). Telegram delivery (`TELEGRAM_*`).
- `bun test` for tests, `tsc --noEmit` for typecheck. No linter is configured.

## Commands

```bash
bun install
bun run dev         # src/index.ts --watchlist
bun run start       # src/index.ts --loop, scheduled by CRON_RADAR
bun run radar       # src/index.ts, one run
bun test
bun run typecheck
```

## Structure

- `src/index.ts`: entry point, with flags `--watchlist` and `--loop`.
- `src/ai.ts`, `digest.ts`, `telegram.ts`: AI summary, digest building, delivery.
- `src/releases.ts`: release tracking. `src/inventory.ts`: watched projects, scanned from `WATCH_DIR` (`WATCH_TOP`, `SCAN_DEPTH`).
- `src/db.ts`: SQLite. `src/config/`: configuration.
- `tests/`: `bun test` suites. `docs/readme/`: README images (mockups with fictional data).
- `REFERENCES.md`: cited projects and documentation.

## Conventions

- Environment variable names are in `.env.example`. Values never go in the repo, and `.env` is gitignored.
- Run `bun test` and `bun run typecheck` before committing.

## Gotchas

- The README images are mockups with fictional data. Do not treat them as real output.
- The only workflow is `validate.yml`, which calls the reusable validate workflow from `juninmd/base-actions`.

<!-- base-actions-main-policy -->
## GitHub Actions — padrão obrigatório (@main)

- Referencie as actions internas sempre pelo branch, nunca por SHA:
  - `uses: juninmd/base-actions/<action>@main`
  - `uses: juninmd/base-actions/.github/workflows/<arquivo>.yml@main`
- Não fixe `@<sha>` em `juninmd/base-actions`: a atualização é centralizada no
  `main` e passa a valer no próximo run.
- PRs cujos checks não iniciam por billing/spending limit são mesclados pelo bot central
  `juninmd/base-actions/.github/workflows/auto-merge-billing-blocked.yml`.
  Para impedir o merge automático de um PR, aplique a label `do-not-merge`.
