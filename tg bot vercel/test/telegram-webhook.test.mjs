import assert from "node:assert/strict";
import test from "node:test";
import { handleWebhook } from "../api/telegram-webhook.mjs";

const secret = "test-webhook-secret-123";
const env = {
  TELEGRAM_BOT_TOKEN: "123456:test-token",
  TELEGRAM_WEBHOOK_SECRET: secret,
};

function makeRequest(update, options = {}) {
  return new Request("https://example.vercel.app/api/telegram-webhook", {
    method: options.method || "POST",
    headers: options.headers || {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": secret,
    },
    body: options.method === "GET" ? undefined : JSON.stringify(update),
  });
}

function makeStore() {
  const users = new Map();
  return {
    users,
    async get(key) {
      return users.get(key) ?? null;
    },
    async set(key, value) {
      users.set(key, value);
    },
  };
}

const startUpdate = {
  message: {
    message_id: 10,
    from: { id: 456 },
    chat: { id: 456, type: "private" },
    text: "/start",
  },
};

test("first private /start sends the poster with two website buttons", async () => {
  const store = makeStore();
  const sent = [];
  const response = await handleWebhook(makeRequest(startUpdate), {
    env,
    store,
    fetchImpl: async (url, options) => {
      sent.push({ url, body: JSON.parse(options.body) });
      return Response.json({ ok: true });
    },
  });

  assert.equal(response.status, 200);
  assert.equal(sent.length, 1);
  assert.match(sent[0].url, /\/bot123456:test-token\/sendPhoto$/);
  assert.equal(sent[0].body.chat_id, 456);
  assert.equal(
    sent[0].body.caption,
    "kelajakdagi yo'lingni biz bilan boshla hamda koinlar bilan maqsadlaringizga erishing!!!",
  );
  assert.deepEqual(
    sent[0].body.reply_markup.inline_keyboard[0].map(({ text, web_app }) => ({
      text,
      url: web_app?.url,
    })),
    [
      { text: "OPENBOT", url: "https://shamsacademycoin.netlify.app" },
      { text: "Reklama", url: "https://shamsacademycoin.netlify.app" },
    ],
  );
  assert.equal(store.users.get("456"), "sent");
});

test("repeat /start from the same user does not send another advertisement", async () => {
  const store = makeStore();
  const requests = [];
  const dependencies = {
    env,
    store,
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return Response.json({ ok: true });
    },
  };

  assert.equal((await handleWebhook(makeRequest(startUpdate), dependencies)).status, 200);
  assert.equal((await handleWebhook(makeRequest(startUpdate), dependencies)).status, 200);
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /\/sendPhoto$/);
  assert.match(requests[1].url, /\/deleteMessage$/);
  assert.deepEqual(requests[1].body, { chat_id: 456, message_id: 10 });
});

test("rejects requests without the Telegram webhook secret", async () => {
  const response = await handleWebhook(
    makeRequest(startUpdate, { headers: { "content-type": "application/json" } }),
    { env, store: makeStore(), fetchImpl: async () => assert.fail("must not send") },
  );

  assert.equal(response.status, 401);
});

test("ignores non-start messages and group chats", async () => {
  const store = makeStore();
  let sentCount = 0;
  const dependencies = {
    env,
    store,
    fetchImpl: async () => {
      sentCount += 1;
      return Response.json({ ok: true });
    },
  };

  const nonStart = structuredClone(startUpdate);
  nonStart.message.text = "/help";
  const groupStart = structuredClone(startUpdate);
  groupStart.message.chat.type = "group";

  assert.equal((await handleWebhook(makeRequest(nonStart), dependencies)).status, 200);
  assert.equal((await handleWebhook(makeRequest(groupStart), dependencies)).status, 200);
  assert.equal(sentCount, 0);
});

test("rejects methods other than POST", async () => {
  const response = await handleWebhook(makeRequest({}, { method: "GET" }), {
    env,
    store: makeStore(),
  });

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
});
