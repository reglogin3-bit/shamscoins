const DEFAULT_SITE_URL = "https://shamsacademycoin.netlify.app";
const WELCOME_CAPTION =
  "kelajakdagi yo'lingni biz bilan boshla hamda koinlar bilan maqsadlaringizga erishing!!!";

// Tiny key-value store on Upstash Redis (REST API), used to remember which
// users already received the ad. Vercel's Upstash integration sets these env vars.
export function createRedisStore(env = process.env, fetchImpl = fetch) {
  const baseUrl = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!baseUrl || !token) {
    throw new Error("Upstash Redis environment variables are not configured.");
  }
  async function run(command) {
    const response = await fetchImpl(baseUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(10_000),
    });
    const result = await response.json();
    if (!response.ok || result.error) {
      throw new Error(result.error || `Redis HTTP ${response.status}`);
    }
    return result.result;
  }
  return {
    get: (key) => run(["GET", `shams:started:${key}`]),
    set: (key, value) => run(["SET", `shams:started:${key}`, value]),
  };
}

export async function handleWebhook(
  request,
  {
    env = process.env,
    fetchImpl = fetch,
    store,
  } = {},
) {
  const WEBSITE_URL = (env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
  const POSTER_URL = `${WEBSITE_URL}/assets/shams-academy-poster.png`;

  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "POST" },
    });
  }

  const botToken = env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET;
  if (!botToken || !webhookSecret) {
    console.error("Telegram bot environment variables are not configured.");
    return new Response("Bot configuration is incomplete", { status: 500 });
  }

  if (
    request.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  let update;
  try {
    update = await request.json();
  } catch (error) {
    console.error("Telegram webhook received invalid JSON:", error);
    return new Response("Invalid JSON", { status: 400 });
  }

  const message = update?.message;
  const senderId = message?.from?.id;
  const isPrivateChat = message?.chat?.type === "private";
  const isStartCommand =
    typeof message?.text === "string" &&
    /^\/start(?:@\w+)?(?:\s+\S.*)?$/i.test(message.text.trim());

  if (!isPrivateChat || !Number.isSafeInteger(senderId) || !isStartCommand) {
    return new Response("OK");
  }

  const userKey = String(senderId);
  try {
    store ??= createRedisStore(env, fetchImpl);
    if (await store.get(userKey)) {
      let deleteResponse;
      try {
        deleteResponse = await fetchImpl(
          `https://api.telegram.org/bot${botToken}/deleteMessage`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              chat_id: message.chat.id,
              message_id: message.message_id,
            }),
            signal: AbortSignal.timeout(10_000),
          },
        );
      } catch (error) {
        console.error("Could not delete the repeated /start message:", error);
        return new Response("Telegram request failed", { status: 502 });
      }

      let deleteResult;
      try {
        deleteResult = await deleteResponse.json();
      } catch (error) {
        console.error(
          "Telegram returned an unreadable deleteMessage response:",
          error,
        );
        return new Response("Telegram returned an invalid response", {
          status: 502,
        });
      }

      if (!deleteResult || typeof deleteResult !== "object") {
        console.error("Telegram returned an invalid deleteMessage response.");
        return new Response("Telegram returned an invalid response", {
          status: 502,
        });
      }

      if (!deleteResponse.ok || !deleteResult.ok) {
        const alreadyDeleted = deleteResult.description
          ?.toLowerCase()
          .includes("message to delete not found");
        if (!alreadyDeleted) {
          console.error(
            "Telegram deleteMessage failed:",
            deleteResult.description || `HTTP ${deleteResponse.status}`,
          );
          return new Response("Telegram could not delete the repeated command", {
            status: 502,
          });
        }
      }
      return new Response("OK");
    }
  } catch (error) {
    console.error("Could not check whether the user already received the ad:", error);
    return new Response("Could not read bot storage", { status: 500 });
  }

  let telegramResponse;
  try {
    telegramResponse = await fetchImpl(
      `https://api.telegram.org/bot${botToken}/sendPhoto`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: message.chat.id,
          photo: POSTER_URL,
          caption: WELCOME_CAPTION,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "OPENBOT", web_app: { url: WEBSITE_URL } },
                { text: "Reklama", web_app: { url: WEBSITE_URL } },
              ],
            ],
          },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch (error) {
    console.error("Could not send the welcome advertisement to Telegram:", error);
    return new Response("Telegram request failed", { status: 502 });
  }

  let telegramResult;
  try {
    telegramResult = await telegramResponse.json();
  } catch (error) {
    console.error("Telegram returned an unreadable sendPhoto response:", error);
    return new Response("Telegram returned an invalid response", { status: 502 });
  }

  if (!telegramResult || typeof telegramResult !== "object") {
    console.error("Telegram returned an invalid sendPhoto response.");
    return new Response("Telegram returned an invalid response", { status: 502 });
  }

  if (!telegramResponse.ok || !telegramResult.ok) {
    console.error(
      "Telegram sendPhoto failed:",
      telegramResult.description || `HTTP ${telegramResponse.status}`,
    );
    return new Response("Telegram could not send the advertisement", {
      status: 502,
    });
  }

  try {
    await store.set(userKey, "sent");
  } catch (error) {
    console.error("Ad was sent, but the user record could not be saved:", error);
    return new Response("Could not save bot state", { status: 500 });
  }

  return new Response("OK");
}

export async function POST(request) {
  return handleWebhook(request);
}

export async function GET(request) {
  return handleWebhook(request);
}
