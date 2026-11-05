# Arculus Order Fraud Panel

A BigCommerce **App Extension** that adds a **Fraud Check** item to each order's action (⋯) menu on the View Orders screen. Clicking it opens a side panel that shows the order's **AVS** (address verification), **CVV** result, card BIN, IP + country, and a **green / amber / red verdict** — reusing the same card-tester signatures as the checkout guard.

Runs as a single AWS Lambda (Node 20) behind a **Lambda Function URL**. Zero npm dependencies — it uses the Lambda runtime's built-in `fetch`, `crypto`, and bundled AWS SDK v3. Per-store access tokens are stored as SSM SecureString parameters.

## Architecture

```
BigCommerce admin  ──(iframe + signed_payload_jwt)──►  Lambda Function URL
   install / order action                                 /auth    OAuth install -> store token, register extension
                                                          /panel   verify jwt -> read order+transactions -> render verdict
                                                          /load    app home screen
```

## One-time setup

### 1. Create the BigCommerce draft app
Dev Portal → **devtools.bigcommerce.com** → **Create an app**.
- **Scopes:** Orders = read-only; App Extensions = manage.
- **Callback URLs** (fill in after the first deploy gives you the Function URL `BASE`):
  - Auth: `BASE/auth`
  - Load: `BASE/load`
  - Uninstall: `BASE/uninstall`
- Copy the **Client ID** and **Client Secret**.

### 2. GitHub repo secrets (Settings → Secrets and variables → Actions)
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
- `BC_CLIENT_ID`, `BC_CLIENT_SECRET`
- `APP_URL` — leave blank for the first deploy, then set it to the Function URL and re-run.

### 3. Deploy
Push to `main` (or run the **deploy** workflow). It runs `sam build` + `sam deploy` and prints the **FunctionUrl** output.
1. First deploy with `APP_URL` empty → copy the printed Function URL.
2. Set the `APP_URL` secret to that URL, set the BigCommerce app callback URLs to `BASE/auth`, `BASE/load`, `BASE/uninstall`.
3. Re-run the deploy so the Lambda has the correct `APP_URL`.

### 4. Install on the store
In the Dev Portal, install the draft app on the Arculus store. The `/auth` handler stores the token and registers the Orders panel. Open any order → ⋯ → **Fraud Check**.

## Local deploy (alternative to CI)

```
sam build
sam deploy --guided \
  --parameter-overrides ClientId=XXX ClientSecret=YYY AppUrl=https://....lambda-url.REGION.on.aws
```

## Notes
- The panel authenticates every request by verifying BigCommerce's `signed_payload_jwt` against the client secret.
- The order id arrives via the `${id}` template in the registered extension URL.
- No card numbers are read or stored — only the gateway's AVS/CVV response codes and the card BIN/last-4 already on the order.
