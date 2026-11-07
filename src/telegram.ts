import { env } from "./config/env.ts";

const API = () => `https://api.telegram.org/bot${env.telegramToken}`;

export type Update = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    from?: { id: number; first_name?: string };
    text?: string;
  };
};

/** Envia Markdown; cai p/ texto puro se a marcação da IA quebrar. Sem token, loga. */
export async function sendTelegram(
  text: string,
  chatId?: string | number,
): Promise<void> {
  const alvos = chatId ? [String(chatId)] : env.telegramChatIds;
  if (!env.telegramToken || !alvos.length) {
    console.log("[telegram] não configurado — imprimindo no console:\n");
    console.log(text);
    return;
  }
  for (const id of alvos) {
    for (const chunk of split(text, 3800)) {
      let res = await send(id, chunk, "Markdown");
      if (res.status === 400) res = await send(id, chunk);
      if (!res.ok) console.error(`[telegram] ${res.status}: ${await res.text()}`);
    }
  }
}

function send(chatId: string, text: string, parseMode?: string): Promise<Response> {
  return fetch(`${API()}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(parseMode ? { parse_mode: parseMode } : {}),
      disable_web_page_preview: true,
    }),
  });
}

/**
 * Long-poll de updates. Chama handler por mensagem; erro num handler não derruba
 * o loop. Roda até o processo morrer.
 */
export async function pollUpdates(
  handler: (msg: NonNullable<Update["message"]>) => Promise<void>,
): Promise<void> {
  if (!env.telegramToken) throw new Error("TELEGRAM_BOT_TOKEN ausente — bot não sobe");
  let offset = 0;
  console.log("[telegram] long-poll iniciado");
  for (;;) {
    try {
      const res = await fetch(
        `${API()}/getUpdates?timeout=50&offset=${offset}&allowed_updates=["message"]`,
        { signal: AbortSignal.timeout(60000) },
      );
      if (!res.ok) throw new Error(`getUpdates ${res.status}`);
      const json = (await res.json()) as { result: Update[] };
      for (const up of json.result) {
        offset = up.update_id + 1;
        if (!up.message?.text) continue;
        try {
          await handler(up.message);
        } catch (err) {
          console.error("[bot] handler:", (err as Error).message);
          await sendTelegram("⚠️ Deu ruim aqui. Tenta de novo.", up.message.chat.id);
        }
      }
    } catch (err) {
      console.error("[telegram] poll:", (err as Error).message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

function split(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let buf = "";
  for (const line of text.split("\n")) {
    if (buf.length + line.length + 1 > max) {
      out.push(buf);
      buf = "";
    }
    buf += `${line}\n`;
  }
  if (buf) out.push(buf);
  return out;
}
