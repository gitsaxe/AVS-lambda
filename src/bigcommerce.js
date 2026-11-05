'use strict';

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const APP_URL = (process.env.APP_URL || '').replace(/\/+$/, '');

function apiBase(hash) {
  return `https://api.bigcommerce.com/stores/${hash}`;
}

async function exchangeToken(code, scope, context) {
  const r = await fetch('https://login.bigcommerce.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      scope,
      grant_type: 'authorization_code',
      redirect_uri: APP_URL + '/auth',
      context,
    }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error('token exchange ' + r.status + ': ' + body);
  return JSON.parse(body);
}

async function registerExtension(hash, token) {
  const url = '/orders/${id}/fraud-check';
  const input = {
    context: 'PANEL',
    model: 'ORDERS',
    url,
    label: { defaultValue: 'Fraud Check', locales: [] },
  };
  const upsertQ = `mutation ($input: UpsertAppExtensionInput!) {
    appExtension { upsertAppExtension(input: $input) { appExtension { id } } }
  }`;
  let r = await fetch(apiBase(hash) + '/graphql', {
    method: 'POST',
    headers: { 'X-Auth-Token': token, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: upsertQ, variables: { input } }),
  });
  let j = await r.json();
  if (j.errors) {
    const createQ = `mutation ($input: CreateAppExtensionInput!) {
      appExtension { createAppExtension(input: $input) { appExtension { id } } }
    }`;
    r = await fetch(apiBase(hash) + '/graphql', {
      method: 'POST',
      headers: { 'X-Auth-Token': token, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: createQ, variables: { input } }),
    });
    j = await r.json();
    if (j.errors) throw new Error('registerExtension: ' + JSON.stringify(j.errors));
  }
  return j;
}

async function apiGet(hash, token, path) {
  const r = await fetch(apiBase(hash) + path, {
    headers: { 'X-Auth-Token': token, Accept: 'application/json' },
  });
  if (!r.ok) {
    if (r.status === 404) return null;
    throw new Error('GET ' + path + ' -> ' + r.status);
  }
  return r.json();
}

const getOrder = (hash, token, id) => apiGet(hash, token, `/v2/orders/${id}`);
const getShipping = (hash, token, id) => apiGet(hash, token, `/v2/orders/${id}/shipping_addresses`);

async function getTransactions(hash, token, id) {
  const j = await apiGet(hash, token, `/v3/orders/${id}/transactions`);
  return (j && j.data) || [];
}

module.exports = { exchangeToken, registerExtension, getOrder, getShipping, getTransactions };
