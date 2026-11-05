# AVS-lambda — BigCommerce Order Fraud Panel

A BigCommerce **App Extension** that adds a **Fraud Check** item to each order's action menu in the admin. It opens a side panel showing the order's **AVS** (address verification), **CVV** result, card BIN, IP + country, and a **green / amber / red verdict**, using the same card-tester signatures as the storefront checkout guard.

Single AWS Lambda (Node 20) behind a Lambda Function URL. No build step and no npm dependencies — it uses the runtime's built-in `fetch`, `crypto`, and bundled AWS SDK v3.

## Layout

```
index.js            re-exports the handler (so the default Lambda handler index.handler works)
src/handler.js      Lambda entry (routes by path)
src/app.js          /auth install, /panel render, /load, /uninstall
src/bigcommerce.js  OAuth token exchange, extension registration, order + transaction reads
src/jwt.js          verifies BigCommerce signed_payload_jwt
src/tokens.js       per-store token storage (SSM SecureString)
src/risk.js         AVS/CVV classification, fraud signatures, panel HTML
```

## Deploy

GitHub Actions (`.github/workflows/deploy.yml`) zips `index.js` + `src/` and pushes it to the `AVS-lambda` function with `appleboy/lambda-action`, on push to `main`.

Repo secrets:
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — an IAM user **in the same AWS account as the `AVS-lambda` function**, with `lambda:UpdateFunctionCode`.
- `AWS_REGION` — e.g. `us-east-2`.
- `BC_CLIENT_ID`, `BC_CLIENT_SECRET` — the BigCommerce app credentials.

## Function configuration (set once in the Lambda console)

- Runtime **Node.js 20.x**, handler `index.handler`, timeout 15s, memory 256 MB.
- A **Function URL** (Auth type NONE) — this is `APP_URL`.
- Environment variables: `CLIENT_ID`, `CLIENT_SECRET`, `APP_URL` (the Function URL), `SSM_PREFIX=/bc-fraud-panel/tokens/`.
- Inline policy on the function role (for token storage):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["ssm:GetParameter", "ssm:PutParameter"], "Resource": "arn:aws:ssm:*:*:parameter/bc-fraud-panel/tokens/*" },
    { "Effect": "Allow", "Action": ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey"], "Resource": "*" }
  ]
}
```

## BigCommerce app

In the draft app (devtools.bigcommerce.com): scopes **Orders read-only** + **App Extensions manage**; callback URLs `APP_URL/auth`, `APP_URL/load`, `APP_URL/uninstall`. Install on the store, then open any order → action menu → **Fraud Check**.
