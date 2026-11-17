import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.ALLOW_DEV_OTP = 'true';
process.env.ALLOW_DEMO_BILLING = 'true';
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test';
process.env.DATABASE_URL = ':memory:';
process.env.UPLOAD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/test-uploads');

const { initDb, closeDb } = await import('../src/db.js');
initDb(':memory:');
const { seed } = await import('../src/seed.js');
await seed();
const { createApp } = await import('../src/server.js');

const server = createApp().listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;

async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : null };
}

test('signup, matching, paywall, and identity rules', async () => {
  const health = await api('/api/health');
  assert.equal(health.status, 200);

  const ananya = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'ananya@milap.dev', password: 'password123' },
  });
  assert.equal(ananya.status, 200);
  const ananyaToken = ananya.json.token;

  const wrong = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'ananya@milap.dev', password: 'nope-nope' },
  });
  assert.equal(wrong.status, 401);

  const deck = await api('/api/discover', { token: ananyaToken });
  assert.equal(deck.status, 200);
  assert.ok(deck.json.results.every((person) => person.gender === 'man'));
  assert.ok(deck.json.results.some((person) => person.displayName === 'Kabir Ahmed' && person.featured));
  const arjunCard = deck.json.results.find((person) => person.displayName === 'Arjun Mehta');
  assert.ok(arjunCard);
  assert.equal(Object.hasOwn(arjunCard, 'phone'), false);

  const arjunLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'arjun@milap.dev', password: 'password123' },
  });
  const arjunToken = arjunLogin.json.token;
  const arjunId = arjunLogin.json.me.id;

  const sent = await api('/api/interests', {
    method: 'POST',
    token: ananyaToken,
    body: { toUserId: arjunId },
  });
  assert.equal(sent.status, 201);
  assert.equal(sent.json.matched, false);

  const inbox = await api('/api/interests', { token: arjunToken });
  const incoming = inbox.json.received.find((item) => item.profile.displayName === 'Ananya Sharma');
  const accepted = await api(`/api/interests/${incoming.id}/respond`, {
    method: 'POST',
    token: arjunToken,
    body: { action: 'accept' },
  });
  assert.equal(accepted.json.matched, true);

  const blockedChat = await api(`/api/matches/${arjunId}/messages`, {
    method: 'POST',
    token: ananyaToken,
    body: { body: 'Hello Arjun' },
  });
  assert.equal(blockedChat.status, 402);
  assert.equal(blockedChat.json.code, 'PAYMENT_REQUIRED');

  const checkout = await api('/api/billing/checkout', {
    method: 'POST',
    token: ananyaToken,
    body: { plan: 'premium' },
  });
  assert.equal(checkout.json.mode, 'demo');
  assert.equal(checkout.json.subscription.plan, 'premium');

  const chat = await api(`/api/matches/${arjunId}/messages`, {
    method: 'POST',
    token: ananyaToken,
    body: { body: 'Hello Arjun' },
  });
  assert.equal(chat.status, 201);

  const arjunThread = await api(`/api/matches/${ananya.json.me.id}/messages`, { token: arjunToken });
  assert.equal(arjunThread.json.messages.at(-1).body, 'Hello Arjun');
  assert.equal(arjunThread.json.canSend, false);

  const contact = await api(`/api/matches/${arjunId}/contact`, { token: ananyaToken });
  assert.equal(contact.status, 200);
  assert.equal(contact.json.email, 'arjun@milap.dev');
  const hidden = await api(`/api/matches/${ananya.json.me.id}/contact`, { token: arjunToken });
  assert.equal(hidden.status, 402);

  const registered = await api('/api/auth/register', {
    method: 'POST',
    body: { email: 'Leela@Example.com', password: 'password123' },
  });
  assert.equal(registered.status, 201);
  assert.match(registered.json.devOtp, /^\d{6}$/);
  const verified = await api('/api/auth/verify-email', {
    method: 'POST',
    body: { email: 'leela@example.com', code: registered.json.devOtp },
  });
  const leela = verified.json.token;
  const profile = {
    displayName: 'Leela Joshi',
    gender: 'woman',
    dateOfBirth: '1998-01-01',
    heightCm: 162,
    city: 'Pune',
    state: 'Maharashtra',
    religion: 'Hindu',
    motherTongue: 'Marathi',
    education: "Bachelor's",
    profession: 'Teacher',
    maritalStatus: 'never_married',
    about: 'I teach and I like bookshops.',
    phone: '9845099988',
  };
  assert.equal((await api('/api/me/profile', { method: 'PUT', token: leela, body: profile })).status, 200);
  const rejected = await api('/api/me/kyc', {
    method: 'POST',
    token: leela,
    body: { aadhaar: '123412341234' },
  });
  assert.equal(rejected.status, 400);
  assert.equal(rejected.json.code, 'AADHAAR_REJECTED');
  const kyc = await api('/api/me/kyc', { method: 'POST', token: leela, body: {} });
  assert.equal(kyc.json.kyc.status, 'verified');
  assert.match(kyc.json.kyc.reference, /^KYC-/);
  assert.equal(JSON.stringify(kyc.json).includes('123412341234'), false);

  const men = (await api('/api/discover', { token: leela })).json.results;
  assert.equal(men.length >= 6, true);
  let sentCount = 0;
  for (const person of men) {
    const result = await api('/api/interests', {
      method: 'POST',
      token: leela,
      body: { toUserId: person.id },
    });
    sentCount += 1;
    if (sentCount <= 5) assert.equal(result.status, 201);
    if (sentCount === 6) {
      assert.equal(result.status, 402);
      break;
    }
  }

  const payload = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_test_1', notes: { userId: arjunId, plan: 'premium' } } } },
  });
  const signature = createHmac('sha256', 'whsec_test').update(payload).digest('hex');
  const bad = await fetch(`${base}/api/billing/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': 'nope' },
    body: payload,
  });
  assert.equal(bad.status, 400);
  const paid = await fetch(`${base}/api/billing/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': signature },
    body: payload,
  });
  assert.equal(paid.status, 200);
  const arjunAfter = await api('/api/me', { token: arjunToken });
  assert.equal(arjunAfter.json.subscription.plan, 'premium');
});

test.after(() => {
  server.close();
  closeDb();
});
