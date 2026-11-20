/**
 * Unit tests for the Google linking flow's safety contract:
 * - a credential-already-in-use collision must surface an explicit choice and
 *   must NOT switch the signed-in identity by itself;
 * - an explicit user choice is the only path to signInWithCredential;
 * - popup cancellation is a no-op;
 * - successful linking keeps the same uid.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSignInWithCredential = vi.fn();
const mockSignInWithPopup = vi.fn();
const mockLinkWithPopup = vi.fn();
const mockCredentialFromError = vi.fn();
const mockOnAuthStateChanged = vi.fn(() => () => {});

vi.mock('firebase/auth', () => ({
	GoogleAuthProvider: class {
		static credentialFromError(...args: unknown[]) {
			return mockCredentialFromError(args[0]);
		}
	},
	linkWithPopup: (...args: unknown[]) => mockLinkWithPopup(...args),
	signInWithCredential: (...args: unknown[]) => mockSignInWithCredential(...args),
	signInWithPopup: (...args: unknown[]) => mockSignInWithPopup(...args),
	onAuthStateChanged: (...args: unknown[]) => mockOnAuthStateChanged(...(args as [])),
}));

vi.mock('@/lib/firebase', () => ({
	auth: { currentUser: { uid: 'anon-uid-1', isAnonymous: true, email: null } },
	authReady: Promise.resolve(null),
	firebaseApp: {},
	db: {},
}));

import { auth } from '@/lib/firebase';
import { continueWithGoogle, googleDisplayName, linkGoogleAccount, switchToGoogleCredential } from '@/lib/googleAuth';

describe('googleAuth', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(auth as { currentUser: unknown }).currentUser = { uid: 'anon-uid-1', isAnonymous: true, email: null };
	});

	it('link success preserves the anonymous uid (upgrade, not switch)', async () => {
		mockLinkWithPopup.mockResolvedValue({ user: { uid: 'anon-uid-1', isAnonymous: false } });
		const result = await linkGoogleAccount();
		expect(result).toEqual({
			status: 'linked',
			user: { uid: 'anon-uid-1', isAnonymous: false },
		});
		expect(mockSignInWithCredential).not.toHaveBeenCalled();
	});

	it('credential-already-in-use returns an explicit-choice result and never switches identity', async () => {
		const error = {
			code: 'auth/credential-already-in-use',
			customData: { email: 'someone@gmail.com' },
		};
		mockLinkWithPopup.mockRejectedValue(error);
		mockCredentialFromError.mockReturnValue({ providerId: 'google.com', signInMethod: 'google.com' });

		const result = await linkGoogleAccount();

		expect(result.status).toBe('already-in-use');
		if (result.status === 'already-in-use') {
			expect(result.email).toBe('someone@gmail.com');
			expect(result.credential).toBeTruthy();
		}
		// The critical guarantee: no silent identity switch.
		expect(mockSignInWithCredential).not.toHaveBeenCalled();
	});

	it('popup closed by the user is a quiet no-op', async () => {
		mockLinkWithPopup.mockRejectedValue({ code: 'auth/popup-closed-by-user' });
		const result = await linkGoogleAccount();
		expect(result).toEqual({ status: 'cancelled' });
		expect(mockSignInWithCredential).not.toHaveBeenCalled();
	});

	it('fails cleanly when there is no signed-in user yet', async () => {
		(auth as { currentUser: unknown }).currentUser = null;
		const result = await linkGoogleAccount();
		expect(result).toEqual({ status: 'error', message: 'Not signed in yet.' });
		expect(mockLinkWithPopup).not.toHaveBeenCalled();
	});

	it('an already-linked (non-anonymous) user is reported linked without a new popup', async () => {
		(auth as { currentUser: unknown }).currentUser = { uid: 'google-uid-9', isAnonymous: false, email: 'someone@gmail.com' };
		const result = await linkGoogleAccount();
		expect(result).toEqual({ status: 'linked', user: { uid: 'google-uid-9', isAnonymous: false, email: 'someone@gmail.com' } });
		expect(mockLinkWithPopup).not.toHaveBeenCalled();
		expect(mockSignInWithCredential).not.toHaveBeenCalled();
	});

	it('an unexpected popup error surfaces as an error and never switches identity', async () => {
		mockLinkWithPopup.mockRejectedValue({ code: 'auth/network-request-failed', message: 'network down' });
		const result = await linkGoogleAccount();
		expect(result.status).toBe('error');
		expect(mockSignInWithCredential).not.toHaveBeenCalled();
	});

	it('explicit switch is the only path to signInWithCredential', async () => {
		const credential = { providerId: 'google.com', signInMethod: 'google.com' };
		mockSignInWithCredential.mockResolvedValue({ user: { uid: 'google-uid-9' } });
		// Deliberately call WITHOUT any prior link attempt: the function itself
		// performs the switch, so the UI is the gatekeeper.
		const user = await switchToGoogleCredential(
			credential as Parameters<typeof switchToGoogleCredential>[0],
		);
		expect(mockSignInWithCredential).toHaveBeenCalledTimes(1);
		expect(user.uid).toBe('google-uid-9');
	});
});

describe('continueWithGoogle (first-run Google choice)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(auth as { currentUser: unknown }).currentUser = { uid: 'anon-uid-1', isAnonymous: true, email: null };
	});

	it('with NO existing session, signs in with Google directly - no anonymous account is created first', async () => {
		(auth as { currentUser: unknown }).currentUser = null;
		mockSignInWithPopup.mockResolvedValue({ user: { uid: 'google-uid-9', isAnonymous: false } });
		const result = await continueWithGoogle();
		expect(result).toEqual({ status: 'linked', user: { uid: 'google-uid-9', isAnonymous: false } });
		expect(mockSignInWithPopup).toHaveBeenCalledTimes(1);
		// The upgrade path must NOT run: there is nothing to upgrade.
		expect(mockLinkWithPopup).not.toHaveBeenCalled();
	});

	it('with a restored anonymous session, links in place to preserve the uid', async () => {
		mockLinkWithPopup.mockResolvedValue({ user: { uid: 'anon-uid-1', isAnonymous: false } });
		const result = await continueWithGoogle();
		expect(result).toEqual({ status: 'linked', user: { uid: 'anon-uid-1', isAnonymous: false } });
		expect(mockLinkWithPopup).toHaveBeenCalledTimes(1);
		expect(mockSignInWithPopup).not.toHaveBeenCalled();
	});

	it('closing the popup on a fresh sign-in is a quiet no-op', async () => {
		(auth as { currentUser: unknown }).currentUser = null;
		mockSignInWithPopup.mockRejectedValue({ code: 'auth/popup-closed-by-user' });
		const result = await continueWithGoogle();
		expect(result).toEqual({ status: 'cancelled' });
	});
});

describe('googleDisplayName', () => {
	it('uses the Google profile name', () => {
		expect(googleDisplayName({ displayName: 'Abraham Murciano', email: 'abrahammurciano@gmail.com' })).toBe('Abraham Murciano');
	});

	it('falls back to the email local part when the profile name is empty', () => {
		expect(googleDisplayName({ displayName: '  ', email: 'abrahammurciano@gmail.com' })).toBe('abrahammurciano');
		expect(googleDisplayName({ displayName: null, email: 'abrahammurciano@gmail.com' })).toBe('abrahammurciano');
	});

	it('falls back to Guest with neither name nor email', () => {
		expect(googleDisplayName({ displayName: null, email: null })).toBe('Guest');
	});
});
