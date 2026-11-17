# Milap

Milap is a matrimony app: create an account, confirm your email, build a profile, send interest, match, and message on a paid plan. The phone interface is a React app. The same build installs on a phone and can be wrapped as an Android or iOS binary.

This is original code. It follows the shape of a matrimony product (profile, interest, accept, subscription). It is not a copy of Shaadi.com or any other site's code, design, or brand.

## Run it locally

You need Node.js 22.13 or newer. This machine's built-in SQLite is the database, so there is nothing else to install.

```bash
npm install
npm test
npm run dev:api
```

In a second terminal:

```bash
npm run dev:web
```

Open http://localhost:5173 on your computer, or `http://<your-lan-ip>:5173` on a phone on the same Wi-Fi. The web dev server proxies `/api` to the API, so the phone does not need a separate API address.

Demo accounts, password `password123`:

- `ananya@milap.dev`
- `arjun@milap.dev`

Other seeded profiles use the same password. A new registration shows the email code on screen until you configure SMTP. Set `ALLOW_DEV_OTP=false` in production when real email is configured.

## What the pieces are

```text
browser or installed app
        |  HTTPS, bearer token
        v
apps/web          React interface. No matching or payment rules live here.
        |
        v
apps/api          Express. Checks the token, then calls domain.js.
        |
        v
domain.js         The product rules: who is visible, who can message, who is paid.
        |
        v
SQLite file       Users, profiles, interests, messages, subscriptions.
```

The interface is not allowed to decide that someone is paid. A phone app can be edited by its owner, so `domain.js` checks the plan on every interest, message, and contact request. A subscription is a row with an end time, not a boolean. When `current_period_end` passes, the account is free again.

Search is filter-then-rank. Hard filters (who they want to meet, age, city, religion, people they already passed or contacted) remove rows. A score then orders whoever is left: same city, religion, mother tongue, and education add points, and a Premium Plus profile is featured. This is the right shape while a city has thousands of profiles, because one indexed query still fits in memory. At a much larger catalogue you would push the filters into the database page by page, and only later consider a dedicated search engine.

Passwords are stored with scrypt. Sessions are signed tokens (HS256). Logging out deletes the token on the phone. The server cannot revoke a token until it expires, which is the tradeoff of this style of session. A production system that must cut off a stolen token keeps a denylist or uses short-lived tokens.

## Identity, including Aadhaar

Email verification is real: a 6-digit code, hashed at rest, expires in 10 minutes. Set the `SMTP_*` variables in `apps/api/.env.example` and the code is emailed instead of shown.

Milap does not collect or store an Aadhaar number. Storing Aadhaar yourself is restricted under Indian law, and a homemade check of a 12-digit number does not verify anyone. The identity screen records a status and a reference such as `KYC-AB12CD34`. The demo button does only that.

For a real launch, replace `POST /api/me/kyc` with a redirect to a UIDAI-licensed KYC provider or DigiLocker. The provider sends your server a success callback. You store their reference and a verified flag. You still do not store the Aadhaar number. The API already rejects a body that contains an Aadhaar-like field, so a modified client cannot sneak one in.

## Plans

| Plan | Price in the app | What it unlocks |
| --- | --- | --- |
| Free | 0 | Browse, 5 interests |
| Premium | ₹499 / 30 days | Unlimited interests, messages after a match, contact details after a match |
| Premium Plus | ₹999 / 30 days | Premium, plus the profile is featured in Discover |

Without Razorpay keys, checkout activates a 30-day demo plan so the product is usable. That path is disabled in production unless you set `ALLOW_DEMO_BILLING=true`. With `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`, checkout creates a Razorpay payment link. The plan becomes active only when Razorpay calls `POST /api/billing/webhook` with a valid signature. The app saying "I paid" is not trusted.

Set `RAZORPAY_WEBHOOK_SECRET` to the webhook secret from the Razorpay dashboard, and point the webhook at `https://<your-api>/api/billing/webhook` for `payment.captured`.

## Host it

### Free customer preview on Render

Render’s free web service gives a public `https://….onrender.com` address and does not ask for a card. The service sleeps after 15 minutes with no visitors, and the first open after that takes about a minute. The free disk is wiped on sleep, so demo profiles come back from the seed, and a profile someone just created can disappear.

1. Create a free GitHub account with the other Gmail and push this project to a new repository.
2. Open https://render.com and sign up with that same Gmail. Choose the free workspace.
3. New → Blueprint → connect the repository. Render reads `render.yaml`.
4. Deploy. The public URL is on the service page. Share that with the customer.

Demo sign-in on that URL is `ananya@milap.dev` / `password123`.

### 1. A single VPS (simplest public launch)

A ₹500–1000/month VM (Hetzner, DigitalOcean, or an Indian VPS) is enough to start. SQLite is one writer, which is a good fit until you have many people writing at once. When you outgrow one machine, move the file to Postgres. Do not run two API servers against one SQLite file.

On the server:

```bash
git clone <your-repo> milap && cd milap
npm install
export NODE_ENV=production
export JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
export DATABASE_URL=file:/var/lib/milap/milap.db
export UPLOAD_DIR=/var/lib/milap/uploads
export ALLOW_DEV_OTP=false
export PUBLIC_APP_URL=https://yourdomain.com
# plus SMTP_*, RAZORPAY_*, CORS_ORIGIN=https://yourdomain.com
npm run build
npm run start:api
```

Keep `JWT_SECRET` stable. Changing it logs everyone out.

Put Caddy or nginx in front so the site and the API share one origin. Then the installed app can call `/api` without extra configuration. Example Caddyfile:

```caddyfile
yourdomain.com {
  encode gzip
  handle /api/* {
    reverse_proxy 127.0.0.1:4000
  }
  handle /uploads/* {
    reverse_proxy 127.0.0.1:4000
  }
  handle {
    root * /var/www/milap
    try_files {path} /index.html
    file_server
  }
}
```

Copy `apps/web/dist` to `/var/www/milap`. Run the API under systemd so it restarts. Back up `/var/lib/milap` every day. Photos and the database live there.

### 2. Fly.io for the API

`apps/api/Dockerfile` and `apps/api/fly.toml` are included. From `apps/api`:

```bash
fly launch --no-deploy
fly volumes create milap_data --size 1 --region bom
fly secrets set JWT_SECRET=... SMTP_HOST=... RAZORPAY_KEY_ID=... RAZORPAY_KEY_SECRET=... RAZORPAY_WEBHOOK_SECRET=...
fly deploy
```

`min_machines_running = 1` matters. SQLite on a volume breaks if two machines write it, and a stopped machine is fine only if Fly starts the same volume again.

Build the web app with the API origin and host the static files on Cloudflare Pages, Netlify, or the same VM:

```bash
VITE_API_URL=https://milap-api.fly.dev npm run build --workspace apps/web
```

If the site and API are on different origins, set `CORS_ORIGIN` to the site origin.

### 3. Install it on a phone

**Home screen (do this first).** Deploy the site over HTTPS, open it in Chrome on Android or Safari on iPhone, and choose Add to Home Screen. The manifest and service worker make it open like an app, without a store review. Use this while you are still changing the product every day.

**Play Store.** One-time setup on a computer with Android Studio:

```bash
cd apps/web
npm run build
npx cap add android
npx cap open android
```

Build a signed app bundle and upload it to Play Console internal testing. Testers can install that build. Before `npm run build`, set `VITE_API_URL` to the public API, because a store binary does not use the Vite dev proxy. You can also set the server inside Account if you need to point a build at a different API.

**App Store.** On a Mac with Xcode:

```bash
cd apps/web
npx cap add ios
npm run cap:ios
```

You need an Apple Developer account. Review will ask for a privacy policy, account deletion, and a way to pay that matches what you tell them. Razorpay inside a web view has extra store rules. Read the current Apple and Google payment policies before you submit, and budget a few weeks for review, not an afternoon.

### 4. Before real users

- Privacy policy and terms, reviewed for India. The in-app page explains what is stored. It is not a legal policy.
- Account deletion. Add it before a store submission. It is not in this version.
- Real KYC through a licensed provider, if you decide identity beyond email is required.
- Turn off demo billing and the on-screen email code in production.
- Rate limits are already on register and login. Add abuse reporting before you scale.
- Do not rank or filter people by caste. Community is intentionally not a matching field.

## Tests

`npm test` signs up a member, rejects an Aadhaar number, matches two demo members, blocks chat until a plan is active, and checks the payment webhook signature.
