# Emmanuel CI Universe Store

Luxury streetwear storefront for Emmanuel CI Universe (ECI), with JWT cookie auth, Printful product/admin management, Stripe Checkout, and Stripe webhook fulfillment.

## Run Locally

```powershell
node server.js
```

Open `http://localhost:3000`.

## Production Env

Copy `.env.example` to `.env` for local development, then add the same values in Vercel Project Settings:

```env
SESSION_SECRET=long-random-secret
SITE_URL=https://your-production-domain.com
ADMIN_EMAILS=owner@example.com
FILE_DB_WRITES=false
STRIPE_SECRET_KEY=sk_live_or_test_key
STRIPE_PUBLISHABLE_KEY=pk_live_or_test_key
STRIPE_WEBHOOK_SECRET=whsec_from_stripe
PRINTFUL_TOKEN=printful-token
PRINTFUL_AUTO_CONFIRM=false
```

Keep `PRINTFUL_AUTO_CONFIRM=false` while testing. In production, Stripe should call:

```text
https://your-production-domain.com/api/stripe/webhook
```

Listen for `checkout.session.completed` and `checkout.session.async_payment_succeeded`.

## Backend Routes

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/products`
- `GET /api/products/:id`
- `POST /api/checkout/session`
- `POST /api/stripe/webhook`
- `GET /api/orders`
- `GET /api/admin/overview`
- `POST /api/admin/products/sync-printful`
- `PUT /api/admin/products/:id`
- `DELETE /api/admin/products/:id`

Vercel is read-only, so auth sessions are signed JWT cookies and file writes are disabled there by default. Local JSON writes can still be enabled for development with `FILE_DB_WRITES=true`.
