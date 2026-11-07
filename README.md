# upstream-radar

Newsletter de release notes é ruído porque fala de coisas que você não usa. Este
bot monta a watchlist **do seu próprio código**: varre os repos clonados,
conta em quantos deles cada dependência aparece (npm + GitHub Actions) e
acompanha só o topo dessa lista.

Quando sai release nova, a IA do cluster lê as notas **sabendo a versão que você
usa e em quantos repos**, e classifica:

| | |
|---|---|
| 🚨 `agir_agora` | segurança ou breaking que já te afeta |
| 🗓️ `agendar` | vale atualizar, sem pressa |
| 💤 `ignorar` | não te toca — nem entra na mensagem (salvo major novo) |

A primeira execução só fotografa o estado atual (senão o primeiro digest seria o
histórico inteiro). Da segunda em diante, só novidade.

## Rodar

```bash
bun install
cp .env.example .env
bun run dev      # imprime a watchlist derivada dos seus repos, sem rede
bun run radar    # roda o radar agora (modo CronJob/once)
bun start        # cron interno, segundas 09h BRT
```

## Testes

```bash
bun test         # testa sanitização de release notes via @juninmd/digest-kit
bun run typecheck
```

Sem `GITHUB_TOKEN` funciona, mas a API de releases limita em 60 req/h.
