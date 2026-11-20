/**
 * Tests for the repo-name localStorage namespace.
 *
 * The app deliberately starts fresh: legacy keys shared with the other
 * same-origin app (`mnp.`, bare `pollSettings.`) must be neither imported
 * nor deleted.
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
		expect(storageKey('ranking.ABC123')).toBe('movie-poll.ranking.ABC123');
		expect(storageKey('pollSettings.ABC123')).toBe('movie-poll.pollSettings.ABC123');
	});

	it('keeps the ?session=N suffix for dev tabs', async () => {
		store = makeStorage();
		const { storageKey } = await freshModule('?session=2');
		expect(storageKey('displayName')).toBe('movie-poll.displayName.s2');
	});

	it('never collides with the legacy shared keys', async () => {
		store = makeStorage();
		const { storageKey } = await freshModule();
		expect(storageKey('displayName')).not.toBe('mnp.displayName');
		expect(storageKey('pollSettings.ABC123')).not.toBe('pollSettings.ABC123');
	});
});

describe('legacy keys from the other same-origin app', () => {
	it('are not imported (the app starts fresh)', async () => {
		store = makeStorage({
			'mnp.displayName': 'Abraham',
			'mnp.polls': '["ABC123"]',
			'pollSettings.ABC123': '{"maxNominationsPerUser":2}',
		});
		await freshModule();
		expect(store.getItem('movie-poll.displayName')).toBeNull();
		expect(store.getItem('movie-poll.polls')).toBeNull();
		expect(store.getItem('movie-poll.pollSettings.ABC123')).toBeNull();
	});

	it('are not modified or deleted', async () => {
		store = makeStorage({
			'mnp.displayName': 'Abraham',
			'pollSettings.ABC123': '{"maxNominationsPerUser":2}',
		});
		await freshModule();
		expect(store.getItem('mnp.displayName')).toBe('Abraham');
		expect(store.getItem('pollSettings.ABC123')).toBe('{"maxNominationsPerUser":2}');
	});
});
