'use strict';
const crypto = require('crypto');

function b64urlToBuf(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function verifyJwt(token, secret) {
  if (!token || typeof token !== 'string') throw new Error('missing token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed jwt');
  const [h, p, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(h + '.' + p).digest();
  const got = b64urlToBuf(sig);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) {
    throw new Error('bad signature');
  }
  const payload = JSON.parse(b64urlToBuf(p).toString('utf8'));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp + 60) throw new Error('expired');
  if (payload.nbf && now < payload.nbf - 60) throw new Error('not yet valid');
  return payload;
}

module.exports = { verifyJwt };
