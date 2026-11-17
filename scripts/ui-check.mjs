import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const chrome = process.env.SKIP_SPAWN
  ? null
  : spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--remote-debugging-port=9335',
  '--user-data-dir=/tmp/milap-chrome-3',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = setTimeout(() => {
  console.error('overall timeout');
  chrome.kill();
  process.exit(1);
}, 70000);

async function getJson(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(4000) });
  return response.json();
}

for (let i = 0; i < 25; i++) {
  try {
    await getJson('http://127.0.0.1:9335/json/version');
    break;
  } catch {
    await sleep(200);
  }
}

const tab = await getJson('http://127.0.0.1:9335/json/new?http://127.0.0.1:5173/register', { method: 'PUT' });
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve);
  ws.addEventListener('error', reject);
});

let nextId = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const waiter = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
  else waiter.resolve(message.result);
});

function send(method, params = {}, timeoutMs = 30000) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${method}`)), timeoutMs);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/register' });
  await sleep(800);
  const email = `ui${Date.now()}@example.com`;
  const step = await evaluate(`(async () => {
    const set = (el, value) => {
      const proto = Object.getPrototypeOf(el);
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const click = (label) => {
      const el = [...document.querySelectorAll('button, a')].find((node) => node.textContent.includes(label));
      if (!el) throw new Error('missing ' + label + ' :: ' + document.body.innerText.slice(0, 400));
      el.click();
    };
    const wait = async (snippet) => {
      for (let i = 0; i < 30; i++) {
        if (document.body.innerText.includes(snippet)) return;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      throw new Error('no ' + snippet + ' :: ' + document.body.innerText.slice(0, 500));
    };
    set(document.querySelector('input[type=email]'), ${JSON.stringify(email)});
    set(document.querySelector('input[type=password]'), 'password123');
    click('Continue');
    await wait('Development code');
    const code = document.body.innerText.match(/Development code: (\\d{6})/)[1];
    set(document.querySelector('input'), code);
    click('Verify email');
    await wait('Who you are');
    const fields = [...document.querySelectorAll('input')];
    set(fields[0], 'Leela Joshi');
    set(fields.find((el) => el.type === 'date'), '1998-04-02');
    set(fields[2], '164');
    set(fields[3], 'Pune');
    set(fields[4], 'Maharashtra');
    click('Continue');
    await wait('Who you want to meet');
    click('Save profile');
    await wait('Confirm it is you');
    click('Complete demo identity check');
    await wait('KYC-');
    click('Go to Discover');
    await wait('Send interest');
    return document.body.innerText.slice(0, 700);
  })()`);
  console.log('SIGNUP_OK');
  console.log(step);
  writeFileSync('/tmp/milap-signup.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));

  await evaluate(`location.href = '/login'`);
  await sleep(500);
  const matched = await evaluate(`(async () => {
    const set = (el, value) => {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const click = (label) => [...document.querySelectorAll('button, a')].find((node) => node.textContent.includes(label)).click();
    const wait = async (snippet) => {
      for (let i = 0; i < 30; i++) {
        if (document.body.innerText.includes(snippet)) return;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      throw new Error('no ' + snippet + ' :: ' + document.body.innerText.slice(0, 600));
    };
    if (!document.body.innerText.includes('Sign in')) location.href = '/login';
    await wait('Password');
    set(document.querySelector('input[type=email]'), 'arjun@milap.dev');
    set(document.querySelector('input[type=password]'), 'password123');
    click('Sign in');
    await wait('Discover');
    location.href = '/interests';
    await wait('Ananya Sharma');
    click('Accept');
    await wait('accepted');
    location.href = '/matches';
    await wait('Say hello');
    [...document.querySelectorAll('a')].find((node) => node.textContent.includes('Ananya Sharma')).click();
    await wait('Reading is free');
    return document.body.innerText.slice(0, 500);
  })()`);
  console.log('MATCH_OK');
  console.log(matched);
  writeFileSync('/tmp/milap-chat-locked.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
} catch (error) {
  console.error('FAIL', error.message);
  try {
    writeFileSync('/tmp/milap-flow-failure.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    console.error(await evaluate('document.body.innerText.slice(0, 800)'));
  } catch (shotError) {
    console.error('no shot', shotError.message);
  }
  process.exitCode = 1;
} finally {
  clearTimeout(fail);
  ws.close();
  chrome?.kill();
}
