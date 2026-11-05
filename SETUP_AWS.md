# One-time AWS setup

The GitHub workflow uses `appleboy/lambda-action`, which pushes the zip straight to an existing Lambda (no S3). The function must be created once first.

## 1. Create the Lambda function once (AWS Console, us-east-2)

Lambda -> **Create function** -> Author from scratch
- Function name: `AVS-lambda`
- Runtime: **Node.js 20.x**
- Execution role: **Create a new role with basic Lambda permissions**
- Create function

Then:
- **Configuration -> General configuration -> Edit:** Timeout 15s, Memory 256 MB. Save.
- **Configuration -> Function URL -> Create:** Auth type **NONE**. Save. Copy the URL (this is `APP_URL`).
- **Configuration -> Environment variables -> Edit:** add
  - `CLIENT_ID` = your BigCommerce app client id
  - `CLIENT_SECRET` = your BigCommerce app client secret
  - `APP_URL` = the Function URL above
  - `SSM_PREFIX` = `/bc-fraud-panel/tokens/`
- **Configuration -> Permissions -> (click the role) -> Add permissions -> Create inline policy -> JSON:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["ssm:GetParameter", "ssm:PutParameter"], "Resource": "arn:aws:ssm:us-east-2:121446621497:parameter/bc-fraud-panel/tokens/*" },
    { "Effect": "Allow", "Action": ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey"], "Resource": "*" }
  ]
}
```

The default handler `index.handler` is correct (the repo's `index.js` re-exports the real handler), so no handler change is needed.

## 2. Deploy

Run the **deploy** workflow. It zips `index.js` + `src/` and pushes the code to `AVS-lambda`. The CI user only needs `lambda:UpdateFunctionCode` on that function.

## 3. BigCommerce app

In the draft app (devtools.bigcommerce.com) set callback URLs to `APP_URL/auth`, `APP_URL/load`, `APP_URL/uninstall`, then install the app on the store. Open any order -> action menu -> **Fraud Check**.
