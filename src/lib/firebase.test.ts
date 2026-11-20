/**
 * Regression tests for authReady's session-restore contract:
 * - a persisted session (anonymous OR Google-linked) must be reused, never
 *   clobbered by an eager anonymous sign-in;
 * - a genuinely new visitor (no restored session) gets one anonymous account.
 */

import { expect, it, vi } from 'vitest';

let authListener: ((user: unknown) => void) | null = null;
const mockSignInAnonymously = vi.fn();

vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/auth', () => ({
	getAuth: () => ({}),
	connectAuthEmulator: vi.fn(),
	onAuthStateChanged: (_auth: unknown, listener: (user: unknown) => void) => {
		authListener = listener;
		return () => {};
	},
	signInAnonymously: (...args: unknown[]) => mockSignInAnonymously(...args),
}));
vi.mock('firebase/firestore', () => ({
	getFirestore: () => ({}),
	connectFirestoreEmulator: vi.fn(),
}));

it('reuses a restored Google-linked session instead of signing in anonymously', async () => {
	vi.resetModules();
	const mod = await import('@/lib/firebase');
	authListener?.({ uid: 'google-uid', isAnonymous: false });
	await expect(mod.authReady).resolves.toBe('google-uid');
	expect(mockSignInAnonymously).not.toHaveBeenCalled();
});

it('reuses a restored anonymous session', async () => {
	vi.resetModules();
	const mod = await import('@/lib/firebase');
	authListener?.({ uid: 'anon-uid', isAnonymous: true });
	await expect(mod.authReady).resolves.toBe('anon-uid');
	expect(mockSignInAnonymously).not.toHaveBeenCalled();
});

it('signs in anonymously only when no session was restored', async () => {
	vi.resetModules();
	mockSignInAnonymously.mockResolvedValueOnce({ user: { uid: 'fresh-anon' } });
	const mod = await import('@/lib/firebase');
	authListener?.(null);
	await expect(mod.authReady).resolves.toBe('fresh-anon');
	expect(mockSignInAnonymously).toHaveBeenCalledTimes(1);
});
