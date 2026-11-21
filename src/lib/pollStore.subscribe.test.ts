/**
 * subscribePoll must never present incomplete data as a loaded poll:
 * - a cache-only (offline) snapshot does not settle the subscription
 * - a failed subscription settles but reports `error`
 * - `pollConfirmed` is only true for a server-confirmed poll document
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handlers = { next: (s: unknown) => void; error: (e: unknown) => void };
const handlers: Handlers[] = [];

vi.mock('@/lib/firebase', () => ({ db: {}, requireUser: vi.fn() }));
vi.mock('firebase/firestore', () => ({
	collection: vi.fn(() => ({})),
	doc: vi.fn(() => ({})),
	onSnapshot: vi.fn((_ref: unknown, next: Handlers['next'], error: Handlers['error']) => {
		handlers.push({ next, error });
		return () => {};
	}),
	setDoc: vi.fn(),
	updateDoc: vi.fn(),
	deleteDoc: vi.fn(),
	deleteField: vi.fn(),
	arrayUnion: vi.fn(),
	arrayRemove: vi.fn(),
	getDoc: vi.fn(),
	runTransaction: vi.fn(),
	writeBatch: vi.fn(),
}));

import { subscribePoll, type PollDocs } from './pollStore';

const snap = (fromCache: boolean, exists = false) => ({
	exists: () => exists,
	data: () => ({ hostId: 'h', phase: 'nominations' }),
	docs: [],
	metadata: { fromCache },
});

describe('subscribePoll', () => {
	let last: PollDocs;
	beforeEach(() => {
		handlers.length = 0;
		subscribePoll('ABC123', (d) => (last = d));
	});

	it('cache-only empty snapshots do not make the poll ready or confirmed', () => {
		handlers.forEach((h) => h.next(snap(true)));
		expect(last.ready).toBe(false);
		expect(last.pollConfirmed).toBe(false);
	});

	it('server snapshots make it ready and confirmed', () => {
		handlers.forEach((h) => h.next(snap(false, true)));
		expect(last.ready).toBe(true);
		expect(last.pollConfirmed).toBe(true);
		expect(last.error).toBeNull();
	});

	it('a failed subscription settles but reports an error', () => {
		handlers[0].next(snap(false, true));
		handlers[1].next(snap(false));
		handlers[2].next(snap(false));
		handlers[3].error(new Error('permission-denied'));
		expect(last.ready).toBe(true);
		expect(last.error).not.toBeNull();
	});
});
