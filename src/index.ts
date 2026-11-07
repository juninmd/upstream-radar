import cron from "node-cron";
import { env } from "./config/env.ts";
import { radar } from "./digest.ts";
import { inventariar } from "./inventory.ts";

const args = process.argv.slice(2);
const tem = (f: string) => args.includes(f);

if (tem("--watchlist")) {
  // Diagnóstico: mostra o que o scanner considera "seu stack", sem rede.
  for (const u of inventariar())
    console.log(`${u.repos.toString().padStart(3)} repos  ${u.chave} @ ${u.versao}`);
} else if (tem("--loop")) {
  cron.schedule(env.cronRadar, () => {
    radar().catch((e) => console.error("[cron]", e));
  });
  console.log(`[cron] radar agendado: ${env.cronRadar}`);
} else {
  await radar();
}
