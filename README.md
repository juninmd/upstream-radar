# upstream-radar

Monta a watchlist **do seu próprio código** e manda no Telegram só as releases que te afetam.

Newsletter de release notes é ruído porque fala de coisas que você não usa. Este bot faz o contrário: varre os repos clonados na sua máquina, conta em quantos deles cada dependência aparece (npm + GitHub Actions), acompanha o topo dessa lista e, quando sai versão nova, pede para uma IA do cluster ler as notas sabendo **qual versão você usa e em quantos repos**. O resultado chega classificado — dá para agir agora, dá para agendar, ou não te toca.

## O que ele faz

- **Inventário local, sem rede.** Lê `package.json` e workflows do GitHub Actions dos seus repos e monta um ranking de dependências por número de repos que as usam.
- **Tradução pacote → repo.** Para pacote npm, consulta `registry.npmjs.org/<pacote>/latest` e extrai o `repository`/`homepage`; para Action, o próprio `owner/repo` já é o repositório.
- **Só novidade.** Consulta as releases do GitHub, descarta `draft`, `prerelease`, backports de linha antiga e tudo que já foi visto.
- **Leitura com contexto.** A IA recebe as notas + a versão declarada + a contagem de repos, e devolve `resumo`, `impacto` e `acao`.
- **Digest ordenado por urgência.** `agir_agora` no topo, `agendar` no meio, `ignorar` fora da mensagem (salvo quando é major novo).
- **Estado em SQLite.** Releases vistas e o cache de pacote→repo ficam em `DB_PATH`.

## Como funciona

```text
WATCH_DIR ──► inventário (npm + actions) ──► top N por nº de repos
                                                     │
                          registry.npmjs.org ◄───────┤ (resolve repo do pacote)
                                                     ▼
                                   api.github.com/repos/<repo>/releases
                                                     │
                                    filtra draft/prerelease/já visto
                                                     ▼
                                  IA (LiteLLM) ──► agir_agora | agendar | ignorar
                                                     ▼
                                            Telegram (Markdown)
```

O inventário é só leitura de disco, sem rede; a rede só entra depois que a watchlist existe. É por isso que `--watchlist` funciona offline, sem token e sem IA.

## Requisitos

- [Bun](https://bun.sh) — o projeto usa `bun:sqlite`, `Bun` como runtime e `bun test`. Node puro não roda.
- Um bot do Telegram (token + chat id) para receber os digests.
- Opcional: um endpoint LiteLLM compatível com OpenAI, para a classificação. Sem ele o bot ainda roda, mas classifica tudo como `agendar`.
- Opcional: `GITHUB_TOKEN`, para sair do limite anônimo de 60 requisições por hora.

## Instalação

```bash
bun install
cp .env.example .env
```

O Bun carrega `.env` sozinho — não há `dotenv` no projeto. Edite o `.env` e rode:

```bash
bun run dev      # imprime a watchlist derivada dos seus repos, sem rede
```

Cada linha da saída tem a forma `N repos  <chave> @ <versão>`, onde a chave é `npm:<pacote>` ou `action:<owner>/<repo>` e a versão é a mais comum entre os repos. Se a lista vier vazia, o problema está em `WATCH_DIR`/`SCAN_DEPTH`: nenhum diretório com `.git` foi encontrado.

Depois de conferir a watchlist:

```bash
bun run radar    # roda uma vez (bom para CronJob)
bun start        # agenda pelo cron interno e fica em loop
```

## Comandos

| Comando | O que faz |
|---|---|
| `bun run dev` | `src/index.ts --watchlist`: imprime a watchlist, sem rede |
| `bun run radar` | `src/index.ts`: uma rodada completa (inventário → releases → IA → Telegram) |
| `bun start` | `src/index.ts --loop`: agenda `CRON_RADAR` com `node-cron` e fica vivo |
| `bun test` | testes do saneamento de release notes |
| `bun run typecheck` | `tsc --noEmit` |

Os argumentos são verificados em ordem: `--watchlist`, `--loop`, e **qualquer outra coisa** cai no modo "roda agora". Um `--help` não imprime ajuda — ele dispara uma rodada.

## Configuração

Tudo vem de variáveis de ambiente, lidas uma vez em `src/config/env.ts`.

| Variável | Padrão | Para quê |
|---|---|---|
| `WATCH_DIR` | `D:/Solutions/pessoal` | Raiz onde estão os repos clonados |
| `SCAN_DEPTH` | `3` | Profundidade máxima da varredura de diretórios |
| `WATCH_TOP` | `25` | Quantas dependências mais usadas entram no radar |
| `RELEASES_POR_PROJETO` | `5` | Releases buscadas por dependência em cada rodada |
| `DB_PATH` | `./data/upstream.db` | Banco SQLite (criado com `mkdir -p` e WAL) |
| `CRON_RADAR` | `0 12 * * 1` | Expressão cron do `bun start` |
| `TELEGRAM_BOT_TOKEN` | vazio | Token do bot; sem ele o digest é impresso no console |
| `TELEGRAM_CHAT_IDS` | vazio | Um ou mais chat ids separados por vírgula |
| `GITHUB_TOKEN` | vazio | Sobe o limite da API de releases |
| `LITELLM_BASE_URL` | `http://litellm.ai.svc.cluster.local:4000/v1` | Endpoint compatível com OpenAI |
| `LITELLM_API_KEY` | vazio | Chave do LiteLLM |
| `LITELLM_MODEL` | `cloud/gemma3` | Modelo usado na classificação |
| `AI_TIMEOUT_MS` | `45000` | Timeout de cada chamada de IA |
| `DEBUG_AI` | não definido | Se definido, imprime a resposta crua do modelo no console |

`CRON_RADAR` é avaliado no fuso do processo, não em BRT. O padrão `0 12 * * 1` significa segunda às 12h no fuso do host — 09h de Brasília se a máquina estiver em UTC, que é o cenário em que o comentário do código faz sentido.

`TELEGRAM_CHAT_IDS` é uma lista separada por vírgula: `123456789,-100987654321`. Espaços em volta são removidos; entradas vazias são descartadas.

## Primeira execução

A primeira rodada é um **snapshot**, não um digest. Se a tabela `vistos` está vazia, o bot:

1. monta a watchlist;
2. busca as releases de cada dependência;
3. marca todas as releases encontradas como já vistas;
4. manda uma única mensagem de confirmação, no formato:

```text
📡 *upstream-radar ligado*
Watchlist montada com N dependências suas (M releases marcadas como já vistas).

Top 5: pacote (X repos), outro pacote (Y repos), ...
```

Sem esse passo, o primeiro digest seria o histórico inteiro de releases de 25 projetos — exatamente o ruído que o bot existe para evitar. A IA **não** é chamada na primeira rodada; ela só entra a partir da segunda.

Se nenhum repo for encontrado em `WATCH_DIR`, ele avisa `⚠️ Nenhum repo encontrado em ...` e para.

## Classificação

A IA recebe a versão que você declarou, a contagem de repos e as notas da release (até 3.000 caracteres), e responde um JSON com três campos. A ação é validada contra a lista:

| Ação | Ícone | Significado, segundo o prompt do sistema |
|---|---|---|
| `agir_agora` | 🚨 | segurança ou breaking que já te afeta |
| `agendar` | 🗓️ | vale atualizar, sem pressa |
| `ignorar` | 💤 | não te toca — some da mensagem, salvo se for major novo |

Regras que valem a pena saber:

- O modelo é instruído a responder `ignorar` quando as notas não trazem nada relevante, sem inventar importância.
- Se a resposta vier com uma ação desconhecida (ou sem JSON), a release é tratada como `agendar`. É o fallback, não um erro fatal.
- Se o `resumo` vier vazio, o nome da release ocupa o lugar; se o `impacto` vier vazio, entra `sem leitura da IA — confira as notas.`
- `ignorar` só aparece na mensagem quando o major da release é maior que o da versão que você usa — é a rede de segurança para "isso muda tudo e você não sabia".
- A mensagem final é ordenada por urgência e enviada em Markdown; se o Telegram recusar a marcação (`400`), o mesmo texto é reenviado puro.
- No máximo **20 releases por rodada** passam pela IA. As demais ficam para a próxima execução.

O formato de cada bloco no Telegram:

```text
🚨 *<nome do pacote> <tag>* ⬆️ *major novo*
_você usa <versão declarada> em <N> repo(s)_
<resumo>
👉 <impacto>
<url da release no GitHub>
```

## Como a watchlist é montada

```text
src/index.ts        # CLI: --watchlist, --loop, rodada única
src/inventory.ts    # varre WATCH_DIR, lê package.json e .github/workflows
src/releases.ts     # resolve pacote -> repo, busca releases, limpa HTML
src/digest.ts       # prompt, classificação, montagem e envio do digest
src/ai.ts           # chat + chatJson com saneamento de JSON
src/telegram.ts     # envio, split em 3.800 chars, fallback sem Markdown
src/db.ts           # bun:sqlite, tabelas repo_cache e vistos
src/config/env.ts   # leitura das variáveis de ambiente
```

Detalhes do inventário:

- Desce até `SCAN_DEPTH` níveis e **para** no primeiro diretório que contém `.git` — o repo é contado como um todo e o bot não entra em submódulos nem em workspaces internos.
- Ignora `node_modules`, `.git`, `dist`, `build`, `vendor`, `.next`, `target` e qualquer entrada que comece com ponto.
- Lê `dependencies` + `devDependencies` do `package.json` e descarta specs que não são versão (`file:`, `link:`, `workspace:`, `git...`).
- Lê `uses: owner/repo@versão` dos arquivos `.yml`/`.yaml` de `.github/workflows`. O padrão espera `owner/repo`; imagens Docker (`docker://...`) não casam e ficam de fora, e uma action local (`./...`) vira uma chave sem sentido (`action:./algo`) que é descartada depois, quando o GitHub devolve `404` para ela.
- A versão exibida é a **mais comum** entre os repos, não a mais nova.
- O ranking é por número de repos; empate resolve pela ordem de inserção no `Map`, ou seja, pela ordem de varredura do disco.

## Estado e cache

Duas tabelas em `src/db.ts`, num SQLite em WAL:

| Tabela | Chave | Conteúdo |
|---|---|---|
| `repo_cache` | `chave` (`npm:x` / `action:x`) | repo GitHub resolvido + data |
| `vistos` | `chave` + `tag` | releases já processadas + data |

O cache de pacote→repo existe porque o registry quase nunca muda de ideia: uma vez resolvido, o pacote não é consultado de novo. Um pacote sem repositório GitHub é gravado como string vazia justamente para não repetir a consulta — consequência: se o pacote ganhar um repo depois, ele continua invisível até você apagar a linha.

`primeiraRodada()` olha apenas se `vistos` está vazia. Apagar o banco (ou trocar `DB_PATH`) faz o bot voltar ao modo snapshot e mandar a mensagem de "ligado" outra vez.

## Testes

```bash
bun test
bun run typecheck
```

`tests/releases.test.ts` cobre o `cleanReleaseNotes`: notas em HTML viram Markdown limpo (via parser do `@juninmd/digest-kit`) e texto simples passa sem alteração. Não há teste do inventário, do digest nem do envio — essas partes dependem de disco, rede e Telegram, e são verificadas rodando `bun run dev` e `bun run radar`.

Não existe workflow de CI neste repositório: nenhum arquivo em `.github/workflows/`.

## Limitações

- **Só npm e GitHub Actions.** Nada de `pip`, `cargo`, `go.mod`, `Gemfile` ou `composer.json`. Um projeto Python/Go não contribui para a watchlist.
- **Só GitHub Releases.** Dependência que publica em changelog, blog ou outro host não gera digest. Tag sem release também não.
- **Precisa dos repos clonados.** A watchlist sai do disco local; um repo que você só usa na CI, ou que não está clonado dentro de `WATCH_DIR`, não entra.
- **Uma versão por dependência.** Se você usa `^3` num repo e `^4` em outro, a IA vê só a mais comum.
- **Sem IA, tudo vira `agendar`.** Com o LiteLLM fora do ar, `chatJson` devolve `null` após duas tentativas e cada release nova é classificada no fallback, com `impacto` genérico — e marcada como vista, então não volta depois.
- **Sem token do GitHub, 60 req/h.** Cada rodada gasta uma chamada de releases por dependência da watchlist (25 com o padrão `WATCH_TOP`), e o limite anônimo é por hora.
- **Sem retry.** Falha de rede em um pacote é logada (`[repo]`/`[releases]`) e a dependência é pulada naquela rodada; ela volta na próxima, porque nada foi marcado como visto.
- **Sem Docker, sem manifest de deploy.** O repositório tem só o processo Bun; o agendamento é o cron interno (`bun start`) ou um CronJob que chame `bun run radar`.
- **Um processo por banco.** Não há lock entre execuções concorrentes; dois `radar` ao mesmo tempo no mesmo `DB_PATH` vão duplicar chamadas de IA.
- **É um digest, não um alerta.** A saída é uma mensagem por rodada, não uma notificação por release.

## Licença

Não há arquivo de licença neste repositório. Sendo o código público e sem licença explícita, ele permanece sob direitos autorais do autor por padrão — não é MIT, Apache nem qualquer outra licença.
