// Bun carrega .env automaticamente — sem dotenv.
const num = (v: string | undefined, d: number) => (v ? Number(v) : d);

export const env = {
  litellmBaseUrl:
    process.env.LITELLM_BASE_URL ?? "http://litellm.ai.svc.cluster.local:4000/v1",
  litellmKey: process.env.LITELLM_API_KEY ?? "",
  litellmModel: process.env.LITELLM_MODEL ?? "cloud/gemma3",
  aiTimeoutMs: num(process.env.AI_TIMEOUT_MS, 45000),

  telegramToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramChatIds: (process.env.TELEGRAM_CHAT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  githubToken: process.env.GITHUB_TOKEN ?? "",

  /** Onde estão os seus repos clonados (a watchlist sai daqui). */
  watchDir: process.env.WATCH_DIR ?? "D:/Solutions/pessoal",
  /** Quantas dependências mais usadas entram no radar. */
  watchTop: num(process.env.WATCH_TOP, 25),
  /** Profundidade máxima da varredura de diretórios. */
  scanDepth: num(process.env.SCAN_DEPTH, 3),
  /** Releases por projeto conferidas a cada rodada. */
  releasesPorProjeto: num(process.env.RELEASES_POR_PROJETO, 5),

  dbPath: process.env.DB_PATH ?? "./data/upstream.db",
  cronRadar: process.env.CRON_RADAR ?? "0 12 * * 1", // segunda, 09h BRT
};
