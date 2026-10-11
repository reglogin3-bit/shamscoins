import { stdin, stdout } from "node:process";

function readHidden(prompt) {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error("Run this script in an interactive terminal.");
  }

  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolve, reject) => {
    let value = "";

    function finish(error) {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    }

    function onData(buffer) {
      for (const character of buffer.toString()) {
        if (character === "\u0003") {
          finish(new Error("Cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
        } else {
          value += character;
        }
      }
    }

    stdin.on("data", onData);
  });
}

async function main() {
  const siteUrl = process.argv[2];
  if (!siteUrl) {
    throw new Error(
      "Usage: node scripts/set-telegram-webhook.mjs https://your-project.vercel.app",
    );
  }

  const parsedSiteUrl = new URL(siteUrl);
  if (parsedSiteUrl.protocol !== "https:" || parsedSiteUrl.pathname !== "/") {
    throw new Error("Enter the site's HTTPS origin, without a path.");
  }

  const botToken = await readHidden("Paste the NEW bot token (input hidden): ");
  const webhookSecret = await readHidden(
    "Paste TELEGRAM_WEBHOOK_SECRET from Vercel (input hidden): ",
  );
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(botToken)) {
    throw new Error("The bot token format is invalid.");
  }
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret)) {
    throw new Error("The webhook secret must use letters, digits, _ or -.");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/setWebhook`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: `${parsedSiteUrl.origin}/api/telegram-webhook`,
        secret_token: webhookSecret,
        max_connections: 1,
        allowed_updates: ["message"],
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(
      `Telegram could not set the webhook: ${result.description || response.status}`,
    );
  }

  console.log(`Webhook enabled: ${parsedSiteUrl.origin}/api/telegram-webhook`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
