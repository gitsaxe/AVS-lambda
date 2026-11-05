'use strict';
const { exchangeToken, registerExtension, getOrder, getShipping, getTransactions } = require('./bigcommerce');
const { verifyJwt } = require('./jwt');
const { putToken, getToken } = require('./tokens');
const { assess, renderPanel, renderMessage } = require('./risk');

const FRAME_HEADERS = {
  'Content-Security-Policy': "frame-ancestors https://*.bigcommerce.com https://*.mybigcommerce.com",
};

function resp(statusCode, body, extraHeaders) {
  return {
    statusCode,
    headers: Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, extraHeaders || {}),
    body,
  };
}

async function route({ method, path, query }) {
  if (path === '/' || path === '') return resp(200, renderMessage('Arculus Order Fraud Panel', 'App is running.'));
  if (path === '/auth') return handleAuth(query);
  if (path === '/load') return handleLoad(query);
  if (path === '/panel') return handlePanel(query);
  if (path === '/uninstall' || path === '/remove-user') return resp(200, 'ok');
  return resp(404, renderMessage('Not found', path));
}

async function handleAuth(q) {
  if (!q.code || !q.context) return resp(400, renderMessage('Install error', 'Missing code or context.'));
  const data = await exchangeToken(q.code, q.scope, q.context);
  const hash = String(data.context || q.context).replace('stores/', '');
  await putToken(hash, data.access_token);
  try {
    await registerExtension(hash, data.access_token);
  } catch (e) {
    console.error('registerExtension failed:', e.message);
  }
  return resp(200, renderMessage('Installed', 'Open any order, click the action menu, and choose Fraud Check.'));
}

async function handleLoad(q) {
  if (q.signed_payload_jwt) {
    try { verifyJwt(q.signed_payload_jwt, process.env.CLIENT_SECRET); } catch (e) { /* noop */ }
  }
  return resp(200, renderMessage('Arculus Order Fraud Panel', 'Open an order action menu and choose Fraud Check to see its AVS/CVV and risk.'), FRAME_HEADERS);
}

async function handlePanel(q) {
  if (!q.signed_payload_jwt) return resp(401, renderMessage('Unauthorized', 'Missing signed payload.'), FRAME_HEADERS);
  let payload;
  try {
    payload = verifyJwt(q.signed_payload_jwt, process.env.CLIENT_SECRET);
  } catch (e) {
    return resp(401, renderMessage('Unauthorized', 'Invalid signature.'), FRAME_HEADERS);
  }
  const hash = String(payload.sub || '').replace('stores/', '');
  const orderId = q.orderId || payload.order_id || (payload.context && payload.context.order_id);
  const token = await getToken(hash);
  if (!token) return resp(200, renderMessage('Not installed', 'No stored token for this store. Reinstall the app.'), FRAME_HEADERS);
  if (!orderId) return resp(200, renderMessage('No order', 'Open this from an order action menu.'), FRAME_HEADERS);

  const [order, txns, shipping] = await Promise.all([
    getOrder(hash, token, orderId),
    getTransactions(hash, token, orderId),
    getShipping(hash, token, orderId),
  ]);
  if (!order) return resp(200, renderMessage('Order not found', '#' + orderId), FRAME_HEADERS);
  const verdict = assess(order, txns, shipping);
  return resp(200, renderPanel(order, txns, verdict), FRAME_HEADERS);
}

module.exports = { route };
