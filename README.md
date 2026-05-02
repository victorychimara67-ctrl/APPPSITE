# Minimal Atelier Store

Luxury fashion storefront with a real Node backend, account signup/login, cart checkout, and Printful POD order integration.

## Run Locally

```powershell
node server.js
```

Open `http://localhost:3000`.

## Configure Printful

1. Copy `.env.example` to `.env`.
2. Set `SESSION_SECRET` to a long random string.
3. Add your `PRINTFUL_TOKEN`.
4. If your token is account-level, add `PRINTFUL_STORE_ID`.
5. Add the Printful sync variant IDs for each local product:

```env
PRINTFUL_VARIANT_hoodie=123456789
PRINTFUL_VARIANT_tee=123456790
```

Keep `PRINTFUL_AUTO_CONFIRM=false` while testing. With this setting, checkout creates draft Printful orders instead of immediately confirming fulfillment.

## Backend Routes

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/products`
- `POST /api/orders`
- `GET /api/orders`

User/session/order data is stored in `data/store.json` for local development.
