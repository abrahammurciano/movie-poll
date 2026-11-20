import { chromium } from 'playwright-core';

const BASE = 'http://localhost:5199/';
const PROD = process.env.PROD === '1';
const FS = 'http://127.0.0.1:8180/v1/projects/movie-poll-6ee55/databases/(default)/documents';
const results = [];
const ok = (name, pass, extra='') => { const line = `${pass ? 'PASS' : 'FAIL'} ${name} ${extra}`; results.push(line); console.log(line); };

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const vp = { width: 1280, height: 900 };

async function passGate(page, name) {
  // First-run gate appears before any page on a fresh browser.
  const gate = page.getByPlaceholder('Your name');
  await gate.waitFor({ timeout: 15000 });
  await gate.fill(name);
  await page.getByRole('button', { name: /Continue without an account|Join without an account/ }).click();
  await page.waitForTimeout(2500);
  await dismissOverlays(page);
}
async function dismissOverlays(page) {
  for (let i = 0; i < 3; i++) {
    const x = page.locator('button:has-text("✕")').first();
    if (await x.isVisible().catch(() => false)) { await x.click(); await page.waitForTimeout(400); } else break;
  }
}
async function peopleNames(page) {
  await page.locator('button[title="View people in this poll"]').click();
  await page.waitForTimeout(800);
  const txt = await page.locator('body').innerText();
  await page.keyboard.press('Escape');
  await dismissOverlays(page);
  return txt;
}

// --- Persona A creates poll 1 ---
const ctxA = await browser.newContext({ viewport: vp });
const A = await ctxA.newPage();
await A.goto(BASE, { waitUntil: 'load' });
await passGate(A, 'Emu Alpha');
await A.getByRole('button', { name: 'Create poll' }).click();
await A.waitForTimeout(3000);
await dismissOverlays(A);
const code1 = new URL(A.url()).hash.replace('#/', '');
ok('A created poll 1', /^[A-Z0-9]{6}$/.test(code1), `(code=${code1})`);

// --- Persona B joins poll 1 via link ---
const ctxB = await browser.newContext({ viewport: vp });
const B = await ctxB.newPage();
await B.goto(BASE + '#/' + code1, { waitUntil: 'load' });
await passGate(B, 'Emu Beta');
await B.waitForTimeout(2000);
await dismissOverlays(B);
ok('B landed in poll 1', new URL(B.url()).hash.includes(code1));

// A sees B live
await A.waitForTimeout(2000);
const namesA1 = await peopleNames(A);
ok('A sees Emu Beta in poll 1', namesA1.includes('Emu Beta'));

// --- A creates poll 2, B joins it ---
await A.goto(BASE, { waitUntil: 'load' });
await A.waitForTimeout(1500);
await A.getByRole('button', { name: 'Create poll' }).click();
await A.waitForTimeout(3000);
await dismissOverlays(A);
const code2 = new URL(A.url()).hash.replace('#/', '');
ok('A created poll 2 (no second gate)', /^[A-Z0-9]{6}$/.test(code2) && code2 !== code1, `(code=${code2})`);
await B.goto(BASE + '#/' + code2, { waitUntil: 'load' });
await B.waitForTimeout(3000);
await dismissOverlays(B);
ok('B joined poll 2', new URL(B.url()).hash.includes(code2));

// --- B renames in poll 2; A must see it in BOTH polls (registry-driven) ---
await B.locator('header button:has-text("Emu Beta")').click();
await B.locator('text=Change your name').waitFor({ timeout: 8000 });
await B.locator('input.cinema-input:not(.pr-9)').fill('Emu Renamed');
await B.getByRole('button', { name: 'Save' }).click();
await B.waitForTimeout(2500);
const namesA2 = await peopleNames(A);
ok('A sees rename in poll 2', namesA2.includes('Emu Renamed') && !namesA2.includes('Emu Beta'));
await A.goto(BASE + '#/' + code1, { waitUntil: 'load' });
await A.waitForTimeout(2500);
await dismissOverlays(A);
const namesA1b = await peopleNames(A);
ok('A sees rename in poll 1 too (cross-poll via registry)', namesA1b.includes('Emu Renamed'));

// --- Host sets a title on poll 1; observer sees it live; homepage lists it ---
await B.goto(BASE + '#/' + code1, { waitUntil: 'load' });
await B.waitForTimeout(2500);
await dismissOverlays(B);
ok('B (non-host) has no title-edit affordance', (await B.getByLabel('Edit poll title').count()) === 0);
await A.getByLabel('Edit poll title').click();
await A.getByPlaceholder('Poll title (optional)').fill('Emulator Movie Night');
await A.getByRole('button', { name: 'Save' }).click();
await A.waitForTimeout(2500);
const headA = await A.locator('header').innerText();
ok('A (host) sees the new title in the header', headA.includes('Emulator Movie Night'));
await B.waitForTimeout(1500);
const headB = await B.locator('header').innerText();
ok('B sees the new title live in the header', headB.includes('Emulator Movie Night'));

// --- KEY: A wipes localStorage entirely; homepage restores both polls from registry ---
await A.evaluate(() => localStorage.clear());
await A.goto(BASE, { waitUntil: 'load' });
await A.waitForTimeout(3500);
const homeA = await A.locator('body').innerText();
ok('after full local wipe, A homepage lists both polls from cloud registry', homeA.includes(code1) && homeA.includes(code2));
ok('homepage list shows the poll title', homeA.includes('Emulator Movie Night'));
ok('after wipe, no name gate (registry name adopted)', homeA.includes('Emu Alpha'));

// --- register-on-open: B loses registry doc + localStorage; re-opening poll re-registers ---
// (emulator only: needs rules bypass to delete the doc)
if (!PROD) {
// find B's registry doc (name Emu Renamed)
const listRes = await fetch(`${FS}/users`, { headers: { Authorization: 'Bearer owner' } });
const list = await listRes.json();
console.log('users collection:', JSON.stringify(list).slice(0, 800));
const bDoc = (list.documents ?? []).find(d => (d.fields?.name?.stringValue === 'Emu Renamed'));
ok('B registry doc exists pre-wipe', !!bDoc);
if (bDoc) {
  await fetch(`${FS}/users/${bDoc.name.split('/').pop()}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
  await B.evaluate(() => localStorage.clear());
  await B.goto(BASE, { waitUntil: 'load' });
  await B.waitForTimeout(2500);
  const homeB = await B.locator('body').innerText();
  ok('B homepage empty after registry+local wipe (registry is source of truth)', !homeB.includes(code1) && !homeB.includes(code2));
  // gate appears (no name anywhere) - re-enter via link
  await B.goto(BASE + '#/' + code1, { waitUntil: 'load' });
  await passGate(B, 'Emu Renamed');
  await B.waitForTimeout(2500);
  await B.goto(BASE, { waitUntil: 'load' });
  await B.waitForTimeout(3000);
  const homeB2 = await B.locator('body').innerText();
  ok('B homepage lists re-opened poll (register-on-open for existing participant)', homeB2.includes(code1));
}

}
// --- localStorage key audit: no poll-list / host / per-poll-settings keys remain ---
const keysA = await A.evaluate(() => Object.keys(localStorage));
const bad = keysA.filter(k => /knownPolls|host\.|pollSettings\.[A-Z0-9]{6}/.test(k));
ok('no legacy poll-list/host/creation-handoff keys in localStorage', bad.length === 0, `(keys=${keysA.join(',')})`);

await browser.close();
console.log('---'); console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
process.exit(failed ? 1 : 0);
