import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

// Sets the bot's menu button (the button left of the message field) to open
// the Mini App. Usage: node scripts/set-menu-button.mjs https://your-project.vercel.app
async function main() {
  const siteUrl = process.argv[2];
  if (!siteUrl) throw new Error("Usage: node scripts/set-menu-button.mjs https://your-project.vercel.app");
  const parsed = new URL(siteUrl);
  if (parsed.protocol !== "https:") throw new Error("The Mini App URL must be HTTPS.");

  const rl = createInterface({ input: stdin, output: stdout });
  const botToken = (await rl.question("Bot token: ")).trim();
  rl.close();
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(botToken)) throw new Error("The bot token format is invalid.");

  const response = await fetch(`https://api.telegram.org/bot${botToken}/setChatMenuButton`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      menu_button: { type: "web_app", text: "Ochish", web_app: { url: parsed.origin } },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`Telegram error: ${result.description || response.status}`);
  console.log("Menu button set: Mini App ->", parsed.origin);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
