'use strict';

const ID_RE = [
  /alp?h?amonies\d*@/, /spruil{3,}\d*@/, /spruill?631@/, /\balp\d{5,}@/, /\bproberson\d+@/,
  /\bse[rn][nm]orro\b/, /\ballbrooks?\b/, /\blynn spruil+\b/, /\bpatricia roberson\b/,
  /\b65\d\d bal+[dl]?oon\b/, /\bbal[dl]oon dr(ive)?\b.*\b2831\d/, /\b1016 louisville st\b/,
];
const PHONES = ['4844597212', '6623641477'];
const BAD_NETS = ['151.240.0.0/16', '181.41.206.0/24', '212.56.53.0/24', '102.129.152.0/23', '102.129.235.0/24', '191.96.106.0/24', '191.96.227.0/24', '37.19.210.0/24', '37.19.220.0/24', '143.244.48.0/22', '149.36.48.0/24', '181.215.182.0/24', '2.56.188.0/22', '92.119.177.0/24', '103.103.98.0/23', '209.66.98.0/24', '154.160.0.0/12'];

function ip4(ip) {
  if (!ip || ip.indexOf('.') < 0) return null;
  const p = ip.split('.');
  if (p.length !== 4) return null;
  return ((+p[0] << 24) >>> 0) + (+p[1] << 16) + (+p[2] << 8) + +p[3];
}

function inNets(ip, nets) {
  const n = ip4(ip);
  if (n === null) return false;
  return nets.some((c) => {
    const [base, bitsStr] = c.split('/');
    const bits = +bitsStr;
    const b = ip4(base);
    const mask = bits ? ((-1 << (32 - bits)) >>> 0) : 0;
    return ((n & mask) >>> 0) === ((b & mask) >>> 0);
  });
}

function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/([a-z0-9._+-]+)@(g(oogle)?mail\.[a-z]+)/g, (_, u) => u.split('+')[0].replace(/\./g, '') + '@gmail.com')
    .replace(/[,#]/g, ' ').replace(/\s+/g, ' ');
}

function matchesActor(fields) {
  const t = norm(fields.join(' '));
  if (ID_RE.some((re) => re.test(t))) return true;
  return fields.some((f) => {
    const d = String(f).replace(/\D/g, '');
    return d.length >= 10 && d.length <= 12 && PHONES.indexOf(d.slice(-10)) > -1;
  });
}

function avsClass(code, message) {
  const c = (code || '').toUpperCase();
  const m = (message || '').toLowerCase();
  if (/address match/.test(m)) return 'pass';
  if (/no match|unavailable|not available/.test(m)) return 'fail';
  if (/zip ?4? match|zip match|locale match/.test(m)) return 'partial';
  if (['X', 'Y', 'D', 'M', 'F'].includes(c)) return 'pass';
  if (['A', 'B', 'Z', 'W', 'P', 'H'].includes(c)) return 'partial';
  if (['N', 'C', 'G', 'I', 'R', 'S', 'U', 'E'].includes(c)) return 'fail';
  return 'unknown';
}

function cvvClass(code) {
  const c = (code || '').toUpperCase();
  if (c === 'M') return 'pass';
  if (c === 'N') return 'fail';
  return 'unknown';
}

function assess(order, txns, shipping) {
  const rank = { green: 0, amber: 1, red: 2 };
  let level = 'green';
  const reasons = [];
  const bump = (l) => { if (rank[l] > rank[level]) level = l; };

  const b = (order && order.billing_address) || {};
  const ship = Array.isArray(shipping) && shipping[0];
  const fields = [b.first_name, b.last_name, b.email, b.street_1, b.street_2, b.city, b.zip, b.phone];
  if (ship) fields.push(ship.first_name, ship.last_name, ship.street_1, ship.city, ship.zip);

  if (matchesActor(fields)) { bump('red'); reasons.push('Matches the known card-tester (name/email/address/phone).'); }

  const ip = order && order.ip_address;
  if (ip && inNets(ip, BAD_NETS)) { bump('red'); reasons.push(`Order IP ${ip} is in a known VPN / tester range.`); }

  const pay = (txns || []).filter((t) => t.event === 'purchase' || t.event === 'authorization');
  const last = pay[pay.length - 1];
  let avs = null, cvv = null, card = null;
  if (last) {
    avs = { code: (last.avs_result || {}).code, message: (last.avs_result || {}).message, cls: avsClass((last.avs_result || {}).code, (last.avs_result || {}).message) };
    cvv = { code: (last.cvv_result || {}).code, cls: cvvClass((last.cvv_result || {}).code) };
    card = last.credit_card || null;
    if (avs.cls === 'fail' && cvv.cls === 'fail') { bump('red'); reasons.push('Both AVS and CVV failed.'); }
    else if (avs.cls === 'fail') { bump('amber'); reasons.push('AVS did not match the card billing address.'); }
    else if (cvv.cls === 'fail') { bump('amber'); reasons.push('CVV did not match.'); }
  }

  if (ship && b.country_iso2 && ship.country_iso2 && b.country_iso2 !== ship.country_iso2) {
    bump('amber'); reasons.push(`Billing country (${b.country_iso2}) differs from shipping (${ship.country_iso2}).`);
  }

  if (order && order.status === 'Incomplete') { bump('amber'); reasons.push('Order is Incomplete (payment was declined).'); }

  if (!reasons.length) reasons.push('No fraud signals: card verification passed and nothing matches known patterns.');
  return { level, reasons, avs, cvv, card };
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function chip(cls) {
  const map = { pass: ['#0a7', '#e8f8f1', 'Pass'], partial: ['#b80', '#fff4e0', 'Partial'], fail: ['#c33', '#fdecec', 'Fail'], unknown: ['#777', '#eee', 'N/A'] };
  const [fg, bg, label] = map[cls] || map.unknown;
  return `<span style="color:${fg};background:${bg};border-radius:10px;padding:2px 10px;font-weight:600;font-size:12px">${label}</span>`;
}

function shell(inner) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>:root{color-scheme:light dark}body{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:16px;color:#1a1a1a;background:#fff}
@media(prefers-color-scheme:dark){body{color:#e8e8e8;background:#1b1b1f}.card{background:#26262c!important;border-color:#3a3a42!important}.row{border-color:#33333a!important}}
.card{border:1px solid #e3e3e8;border-radius:12px;padding:14px 16px;margin:0 0 12px}
.row{display:flex;justify-content:space-between;gap:12px;padding:4px 0;border-bottom:1px solid #f0f0f3}
.row:last-child{border-bottom:0}.k{color:#777}.v{font-weight:600;text-align:right}
.banner{border-radius:12px;padding:12px 16px;margin:0 0 14px;font-weight:700}
.green{background:#e8f8f1;color:#076}.amber{background:#fff4e0;color:#9a5b00}.red{background:#fdecec;color:#b02020}
ul{margin:8px 0 0;padding-left:18px}li{margin:2px 0}</style></head><body>${inner}</body></html>`;
}

function renderMessage(title, msg) {
  return shell(`<div class="card"><h3 style="margin:0 0 6px">${esc(title)}</h3><p style="margin:0;color:#777">${esc(msg)}</p></div>`);
}

function renderPanel(order, txns, v) {
  const b = (order && order.billing_address) || {};
  const bannerText = { green: '✓ Looks legitimate', amber: '⚠ Review recommended', red: '✗ High fraud risk' }[v.level];
  const card = v.card ? `${esc(v.card.card_type)} •••• ${esc(v.card.card_last4)} (BIN ${esc(v.card.card_iin)})` : '—';
  return shell(`
    <div class="banner ${v.level}">${bannerText}</div>
    <div class="card">
      <div class="row"><span class="k">Order</span><span class="v">#${esc(order.id)} · ${esc(order.status)}</span></div>
      <div class="row"><span class="k">Total</span><span class="v">${esc(order.total_inc_tax)} ${esc(order.currency_code || '')}</span></div>
      <div class="row"><span class="k">Name</span><span class="v">${esc(b.first_name)} ${esc(b.last_name)}</span></div>
      <div class="row"><span class="k">Email</span><span class="v">${esc(b.email)}</span></div>
      <div class="row"><span class="k">IP</span><span class="v">${esc(order.ip_address) || '—'} ${esc(order.geoip_country_iso2 || '')}</span></div>
    </div>
    <div class="card">
      <div class="row"><span class="k">AVS (address)</span><span class="v">${chip(v.avs ? v.avs.cls : 'unknown')} ${esc(v.avs && v.avs.code)} ${esc(v.avs && v.avs.message)}</span></div>
      <div class="row"><span class="k">CVV (security code)</span><span class="v">${chip(v.cvv ? v.cvv.cls : 'unknown')} ${esc(v.cvv && v.cvv.code)}</span></div>
      <div class="row"><span class="k">Card</span><span class="v">${card}</span></div>
    </div>
    <div class="card"><strong>Why this verdict</strong><ul>${v.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>`);
}

module.exports = { assess, renderPanel, renderMessage, matchesActor, inNets };
