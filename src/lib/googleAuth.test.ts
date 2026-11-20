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
	onAuthStateChanged: (...args: unknown[]) => mockOnAuthStateChanged(...(args as [])),
}));

vi.mock('@/lib/firebase', () => ({
	auth: { currentUser: { uid: 'anon-uid-1', isAnonymous: true, email: null } },
	firebaseApp: {},
	db: {},
}));

import { linkGoogleAccount, switchToGoogleCredential } from '@/lib/googleAuth';

describe('googleAuth', () => {
	beforeEach(() => {
		vi.clearAllMocks();
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
