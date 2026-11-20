import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
page.on('console', (m) => console.error('CONSOLE[' + m.type() + ']:', m.text().slice(0, 300)));
await page.goto('https://movie-poll-6ee55.web.app/#/TQKOMI');
const nameInput = page.getByPlaceholder('Your name');
await nameInput.waitFor({ timeout: 20000 });
await nameInput.fill('Carol');
await page.getByRole('button', { name: 'Join poll' }).click();
try {
	await page.getByText(/voting closed/i).first().waitFor({ timeout: 25000 });
	console.log('RESULT: voting closed visible');
} catch {
	console.log('RESULT: never saw voting closed; banner text now:');
	const banner = await page.locator('body').innerText();
	console.log(banner.slice(0, 400));
}
await browser.close();
process.exit(0);
