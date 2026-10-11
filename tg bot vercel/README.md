# Shams Academy site, Telegram bot and Mini App (Vercel)

- `index.html` — Uzbek landing page (Mini App start page).
- `ShamsAcademy.html` — the Academy platform.
- `api/telegram-webhook.mjs` — serverless Telegram bot (Vercel Function).
- `scripts/` — build, webhook registration, menu button.

First `/start` from a user: the bot sends the poster with **OPENBOT** and
**Reklama** buttons that open the site as a Telegram Mini App. Repeated
`/start` messages from the same user are deleted. Users are remembered in
Upstash Redis.

## Deploy on Vercel (free Hobby plan)

1. Push this folder to GitHub, then on vercel.com choose **Add New → Project**
   and import the repo (or run `npx vercel --prod` in this folder).
   `vercel.json` already sets the build command and `dist` output.
2. In the project: **Storage / Marketplace → Upstash Redis** (free) → connect it
   to the project. This adds `KV_REST_API_URL`/`KV_REST_API_TOKEN` (or
   `UPSTASH_REDIS_REST_*`) automatically.
3. **Settings → Environment Variables**, add:
   - `TELEGRAM_BOT_TOKEN` — the NEW token from @BotFather (revoke the old one).
   - `TELEGRAM_WEBHOOK_SECRET` — random 1–256 chars of letters/digits/_/-.
   - `SITE_URL` — your final site URL, e.g. `https://your-project.vercel.app`
     (no trailing slash).
4. Redeploy (Deployments → Redeploy) so variables take effect.
5. Register the webhook and menu button locally (Node 22+):

   ```sh
   node scripts/set-telegram-webhook.mjs https://your-project.vercel.app
   node scripts/set-menu-button.mjs https://your-project.vercel.app
   ```

6. Test `/start` in the bot. Optional: @BotFather → `/newapp` with the site URL.

Also replace `https://shamsacademycoin.netlify.app` in `index.html` (og:image)
with the new URL.

## Local checks

```sh
npm install
npm run build
npm test
```
