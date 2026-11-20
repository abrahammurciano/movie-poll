/**
 * Tests for the repo-name localStorage namespace and the one-time migration
 * of legacy shared keys (`mnp.`, bare `pollSettings.`).
 *
 * identity.ts runs its migration at module load, so each test stubs
 * window/localStorage and re-imports the module fresh.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeStorage(initial: Record<string, string> = {}): Storage {
	const data = new Map(Object.entries(initial));
	return {
		get length() {
			return data.size;
		},
		clear: () => data.clear(),
		getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
		key: (i: number) => Array.from(data.keys())[i] ?? null,
		removeItem: (k: string) => void data.delete(k),
		setItem: (k: string, v: string) => void data.set(k, String(v)),
	} as Storage;
}

let store: Storage;

async function freshModule(search = '') {
	vi.stubGlobal('localStorage', store);
	vi.stubGlobal('window', { location: { search } });
	vi.resetModules();
	return import('@/lib/identity');
}

beforeEach(() => {
	vi.unstubAllGlobals();
});

describe('storageKey', () => {
	it('namespaces keys with the repo name', async () => {
		store = makeStorage();
		const { storageKey } = await freshModule();
		expect(storageKey('displayName')).toBe('movie-poll.displayName');
	});

	it('keeps the ?session=N suffix for dev tabs', async () => {
		store = makeStorage();
		const { storageKey } = await freshModule('?session=2');
		expect(storageKey('displayName')).toBe('movie-poll.displayName.s2');
	});
});

describe('legacy key migration', () => {
	it('copies mnp.* and pollSettings.* keys into the namespace', async () => {
		store = makeStorage({
			'mnp.displayName': 'Abraham',
			'mnp.polls': '["ABC123"]',
			'mnp.ranking.ABC123': '["m1","m2"]',
			'mnp.host.ABC123': '1',
			'pollSettings.ABC123': '{"maxNominationsPerUser":2}',
		});
		await freshModule();
		expect(store.getItem('movie-poll.displayName')).toBe('Abraham');
		expect(store.getItem('movie-poll.polls')).toBe('["ABC123"]');
		expect(store.getItem('movie-poll.ranking.ABC123')).toBe('["m1","m2"]');
		expect(store.getItem('movie-poll.host.ABC123')).toBe('1');
		expect(store.getItem('movie-poll.pollSettings.ABC123')).toBe(
			'{"maxNominationsPerUser":2}',
		);
	});

	it('preserves session-suffixed legacy keys with their suffix', async () => {
		store = makeStorage({ 'mnp.displayName.s2': 'DevTab' });
		await freshModule();
		expect(store.getItem('movie-poll.displayName.s2')).toBe('DevTab');
	});

	it('never deletes legacy keys (the other same-origin app still reads them)', async () => {
		store = makeStorage({ 'mnp.displayName': 'Abraham' });
		await freshModule();
		expect(store.getItem('mnp.displayName')).toBe('Abraham');
	});

	it('does not clobber a value already written under the new namespace', async () => {
		store = makeStorage({
			'mnp.displayName': 'Old',
			'movie-poll.displayName': 'New',
		});
		await freshModule();
		expect(store.getItem('movie-poll.displayName')).toBe('New');
	});

	it('leaves unrelated keys alone', async () => {
		store = makeStorage({ 'other-app.setting': 'x', foo: 'y' });
		await freshModule();
		expect(store.getItem('other-app.setting')).toBe('x');
		expect(store.getItem('movie-poll.foo')).toBeNull();
	});
});
