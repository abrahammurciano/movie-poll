/**
 * End-to-end smoke test + screenshot capture.
 *
 * Drives the app against the local Firebase emulators with two independent
 * browser contexts (host + guest): create poll, join, nominate, advance to
 * voting, vote, auto-close to results. Captures screenshots to e2e/shots/.
 *
 * Requires: firebase emulators running (auth 9199, firestore 8180) and
 * `vite dev` on :5173 with VITE_USE_FIREBASE_EMULATOR=1.
 */

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:5173';
const SHOTS = new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
	executablePath: '/usr/bin/google-chrome',
	args: ['--no-sandbox', '--font-render-hinting=none'],
});

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

const ctx = (viewport) => browser.newContext({ viewport, deviceScaleFactor: 2 });

const shots = [];
async function shot(page, name) {
	const path = `${SHOTS}${name}.png`;
	await page.screenshot({ path });
	shots.push(path);
	console.log('shot:', name);
}

const fail = (msg) => {
	console.error('E2E FAIL:', msg);
	process.exit(1);
};

// ── Host creates a poll ────────────────────────────────────────────────
const hostCtx = await ctx(MOBILE);
const host = await hostCtx.newPage();
host.on('pageerror', (e) => console.error('host pageerror:', e.message));
host.on('console', (m) => m.type() === 'error' && console.error('host console:', m.text()));
await host.goto(BASE);
await host.getByText('Hello there').click();
await host.getByPlaceholder('Your name').fill('Alice');
await host.getByRole('button', { name: 'Save' }).click();
await host.getByRole('button', { name: 'Create poll' }).click();
await host.waitForURL(/#\/[A-Z0-9]{6}/, { timeout: 15000 });
const code = host.url().match(/#\/([A-Z0-9]{6})/)[1];
console.log('poll code:', code);
const nameInput = host.getByPlaceholder('Your name');
if (await nameInput.isVisible().catch(() => false)) {
	await nameInput.fill('Alice');
	await host.getByRole('button', { name: 'Continue' }).click();
}
await host.getByText(/1 joined|only one here/i).first().waitFor({ timeout: 20000 });
// The auto-opened invite sheet covers the page; close it.
await host.getByRole('button', { name: '✕' }).first().click();
await host.waitForTimeout(500);
await shot(host, '01-host-created-mobile');

// ── Guest joins ────────────────────────────────────────────────────────
const guestCtx = await ctx(MOBILE);
const guest = await guestCtx.newPage();
guest.on('pageerror', (e) => console.error('guest pageerror:', e.message));
guest.on('console', (m) => m.type() === 'error' && console.error('guest console:', m.text()));
await guest.goto(`${BASE}/#/${code}`);
const guestName = guest.getByPlaceholder('Your name');
await guestName.waitFor({ timeout: 20000 });
await guestName.fill('Bob');
await guest.getByRole('button', { name: 'Join poll' }).click();
await host.getByText(/2 joined/).waitFor({ timeout: 20000 });
await shot(guest, '02-guest-joined-mobile');

// ── Both nominate ──────────────────────────────────────────────────────
async function nominate(page, query, pick) {
	await page.getByPlaceholder('Search for a movie…').click();
	await page.keyboard.type(query, { delay: 25 });
	const option = page.getByText(pick, { exact: false }).first();
	await option.waitFor({ timeout: 20000 });
	await option.click();
	const nominateBtn = page.getByRole('button', { name: /^Nominate/ });
	await nominateBtn.waitFor({ timeout: 10000 });
	await nominateBtn.click();
	await page.waitForTimeout(1500);
}
await nominate(host, 'Spirited Away', 'Spirited Away');
await nominate(guest, 'The Matrix', 'The Matrix');
await host.getByText('Nominated — 2').waitFor({ timeout: 20000 });
await shot(host, '03-nominations-mobile');

// ── Host starts voting ─────────────────────────────────────────────────
await host.getByRole('button', { name: /Start voting/i }).first().click();
// confirmation modal
await host.getByRole('button', { name: 'Start voting', exact: true }).last().click();
await host.getByText(/Rank all the movies/).waitFor({ timeout: 20000 });

// ── Both vote: click each nomination, then submit ──────────────────────
async function vote(page) {
	await page.locator('li', { hasText: 'Spirited Away' }).first().click();
	await page.waitForTimeout(600);
	await page.locator('li', { hasText: 'The Matrix' }).first().click();
	const submit = page.getByRole('button', { name: 'Submit ballot' });
	await submit.waitFor({ timeout: 10000 });
	await submit.click();
	await page.getByText(/Ballot submitted/).waitFor({ timeout: 10000 });
}
await vote(host);
await shot(host, '04-voting-mobile');
await vote(guest);

// ── Auto-close to results once everyone voted ──────────────────────────
await host.getByText(/final round votes|winner|results/i).first().waitFor({ timeout: 20000 });
await host.waitForTimeout(1500);
await shot(host, '05-results-mobile');

// ── Desktop screenshots ────────────────────────────────────────────────
const deskCtx = await ctx(DESKTOP);
const desk = await deskCtx.newPage();
await desk.goto(`${BASE}/#/${code}`);
const deskName = desk.getByPlaceholder('Your name');
await deskName.waitFor({ timeout: 20000 });
await deskName.fill('Carol');
await desk.getByRole('button', { name: 'Join poll' }).click();
await desk.waitForTimeout(2500);
await shot(desk, '06-results-desktop');
await desk.goto(BASE);
await desk.getByText(/Your polls/).waitFor({ timeout: 20000 });
await shot(desk, '07-home-desktop');

console.log('E2E OK');
console.log(shots.join('\n'));
await browser.close();
process.exit(0);
