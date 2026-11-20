/**
 * The account-creation gate's contract:
 * - a persisted session (anonymous OR Google-linked) is reused, never
 *   clobbered;
 * - a first-time visitor gets NO account from authReady alone - not even an
 *   anonymous one - so nothing is decided before the explicit choice;
 * - an anonymous account is created only by ensureAnonymousUser, which the
 *   UI calls only after the visitor picks the anonymous option;
 * - requireUser pends for a first-time visitor until a sign-in happens
 *   (whichever option they chose), so no poll read/create/join can fire
 *   before the choice.
 */

import { beforeEach, expect, it, vi } from 'vitest';

type Listener = (user: unknown) => void;
let listeners: Listener[] = [];
let currentUser: unknown = null;
const mockSignInAnonymously = vi.fn();

vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/auth', () => ({
	getAuth: () => ({
		get currentUser() {
			return currentUser;
		},
	}),
	connectAuthEmulator: vi.fn(),
	onAuthStateChanged: (_auth: unknown, listener: Listener) => {
		listeners.push(listener);
		return () => {
			listeners = listeners.filter((l) => l !== listener);
		};
	},
	signInAnonymously: (...args: unknown[]) => mockSignInAnonymously(...args),
}));
vi.mock('firebase/firestore', () => ({
	getFirestore: () => ({}),
	connectFirestoreEmulator: vi.fn(),
}));

function emit(user: unknown) {
	currentUser = user;
	for (const l of [...listeners]) l(user);
}

beforeEach(() => {
	vi.clearAllMocks();
	listeners = [];
	currentUser = null;
});

it('reuses a restored Google-linked session instead of signing in anonymously', async () => {
	vi.resetModules();
	const mod = await import('@/lib/firebase');
	const user = { uid: 'google-uid', isAnonymous: false };
	emit(user);
	await expect(mod.authReady).resolves.toBe(user);
	expect(mockSignInAnonymously).not.toHaveBeenCalled();
});

it('reuses a restored anonymous session', async () => {
	vi.resetModules();
	const mod = await import('@/lib/firebase');
	const user = { uid: 'anon-uid', isAnonymous: true };
	emit(user);
	await expect(mod.authReady).resolves.toBe(user);
	expect(mockSignInAnonymously).not.toHaveBeenCalled();
});

it('creates NO account for a first-time visitor before the explicit choice', async () => {
	vi.resetModules();
	const mod = await import('@/lib/firebase');
	emit(null); // persistence restore finished: no session
	await expect(mod.authReady).resolves.toBeNull();
	expect(mockSignInAnonymously).not.toHaveBeenCalled();
});

it('ensureAnonymousUser reuses an existing session instead of creating a new account', async () => {
	vi.resetModules();
	const mod = await import('@/lib/firebase');
	const user = { uid: 'anon-uid', isAnonymous: true };
	emit(user);
	await mod.authReady;
	await expect(mod.ensureAnonymousUser()).resolves.toBe(user);
	expect(mockSignInAnonymously).not.toHaveBeenCalled();
});

it('ensureAnonymousUser creates the anonymous account exactly once, on demand', async () => {
	vi.resetModules();
	mockSignInAnonymously.mockImplementationOnce(() => {
		const user = { uid: 'fresh-anon', isAnonymous: true };
		emit(user);
		return Promise.resolve({ user });
	});
	const mod = await import('@/lib/firebase');
	emit(null);
	await mod.authReady;
	const user = await mod.ensureAnonymousUser();
	expect(user).toEqual({ uid: 'fresh-anon', isAnonymous: true });
	expect(mockSignInAnonymously).toHaveBeenCalledTimes(1);
});

it('requireUser pends for a first-time visitor until the chosen sign-in completes', async () => {
	vi.resetModules();
	const mod = await import('@/lib/firebase');
	emit(null);
	await mod.authReady;
	let settled = false;
	const pending = mod.requireUser().then((u) => {
		settled = true;
		return u;
	});
	await Promise.resolve();
	expect(settled).toBe(false); // still waiting: no identity before the choice
	const googleUser = { uid: 'google-uid', isAnonymous: false };
	emit(googleUser); // the visitor's Google sign-in completes
	await expect(pending).resolves.toBe(googleUser);
});
