'use strict';
const { SSMClient, GetParameterCommand, PutParameterCommand } = require('@aws-sdk/client-ssm');

const ssm = new SSMClient({});
const PREFIX = process.env.SSM_PREFIX || '/bc-fraud-panel/tokens/';

async function putToken(storeHash, accessToken) {
  await ssm.send(new PutParameterCommand({
    Name: PREFIX + storeHash,
    Value: accessToken,
    Type: 'SecureString',
    Overwrite: true,
  }));
}

async function getToken(storeHash) {
  try {
    const r = await ssm.send(new GetParameterCommand({ Name: PREFIX + storeHash, WithDecryption: true }));
    return r.Parameter && r.Parameter.Value;
  } catch (e) {
    if (e.name === 'ParameterNotFound') return null;
    throw e;
  }
}

module.exports = { putToken, getToken };
