# One-time AWS setup

The GitHub Actions deploy user has narrow permissions (no S3 bucket creation, no IAM role creation), so SAM/CloudFormation can't run. This project deploys with a direct Lambda zip update instead. That needs the function to exist once, plus two permissions on the CI user.

## 1. Create the Lambda function once (AWS Console, us-east-2)

Lambda -> **Create function** -> Author from scratch
- Function name: `avs-fraud-panel`
- Runtime: **Node.js 20.x**
- Architecture: x86_64
- Execution role: **Create a new role with basic Lambda permissions**
- Create function

Then set a handler and a Function URL:
- **Code** tab -> **Runtime settings** -> Edit -> Handler = `src/handler.handler` -> Save
- **Configuration** -> **Function URL** -> Create function URL -> Auth type **NONE** -> Save -> copy the URL (this is `APP_URL`)
- **Configuration** -> **General configuration** -> Edit -> Timeout 15s, Memory 256 MB -> Save

Give the function's role SSM access (it stores the BigCommerce token):
- **Configuration** -> **Permissions** -> click the role name (opens IAM)
- Add permissions -> Create inline policy -> JSON:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["ssm:GetParameter", "ssm:PutParameter"], "Resource": "arn:aws:ssm:us-east-2:121446621497:parameter/bc-fraud-panel/tokens/*" },
    { "Effect": "Allow", "Action": ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey"], "Resource": "*" }
  ]
}
```

## 2. Allow the CI user to update the function

Attach this policy to the IAM user whose keys are in `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow",
      "Action": ["lambda:GetFunction", "lambda:UpdateFunctionCode", "lambda:UpdateFunctionConfiguration"],
      "Resource": "arn:aws:lambda:us-east-2:121446621497:function:avs-fraud-panel" }
  ]
}
```

## 3. Deploy

- Set the `APP_URL` secret to the Function URL from step 1.
- Run the **deploy** workflow. It zips `src/`, updates the function code, and sets the env vars from the BC secrets.

## 4. BigCommerce app

In the draft app (devtools.bigcommerce.com) set the callback URLs to `APP_URL/auth`, `APP_URL/load`, `APP_URL/uninstall`, then install the app on the store. Open any order -> action menu -> **Fraud Check**.
