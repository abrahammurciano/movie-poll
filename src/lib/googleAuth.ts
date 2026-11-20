/**
 * Optional Google sign-in on top of anonymous auth.
 *
 * Default flow stays anonymous: every visitor gets an anonymous uid and can
 * create/join polls without any account. A user may OPTIONALLY link Google
 * to keep their identity across devices and browsers.
 *
 * Linking uses linkWithPopup, which upgrades the CURRENT anonymous user:
 * the uid (and therefore every poll membership, nomination, ballot and host
 * role tied to it) is preserved.
 *
 * If the Google account is already linked to a DIFFERENT user in this app
 * (auth/credential-already-in-use), we do NOT switch identities silently:
 * linking fails, the anonymous session stays active, and the caller must ask
 * the user to explicitly choose to switch (switchToGoogleCredential). Their
 * existing polls stay with the identity that created them; the app does not
 * transfer participation between identities.
 */

import {
	GoogleAuthProvider,
	linkWithPopup,
	onAuthStateChanged,
	signInWithCredential,
	signInWithPopup,
	type AuthCredential,
	type User,
} from 'firebase/auth';
import { auth, authReady } from '@/lib/firebase';

const provider = new GoogleAuthProvider();

export type LinkGoogleResult =
	| { status: 'linked'; user: User }
	| { status: 'already-in-use'; credential: AuthCredential; email: string | null }
	| { status: 'cancelled' }
	| { status: 'error'; message: string };

export async function linkGoogleAccount(): Promise<LinkGoogleResult> {
	const current = auth.currentUser;
	if (!current) return { status: 'error', message: 'Not signed in yet.' };
	if (!current.isAnonymous) return { status: 'linked', user: current };
	try {
		const result = await linkWithPopup(current, provider);
		return { status: 'linked', user: result.user };
	} catch (err) {
		const code = (err as { code?: string }).code;
		if (code === 'auth/credential-already-in-use') {
			const credential = GoogleAuthProvider.credentialFromError(
				err as Parameters<typeof GoogleAuthProvider.credentialFromError>[0],
			);
			if (credential) {
				const email =
					((err as { customData?: { email?: string } }).customData?.email ?? null);
				return {
					status: 'already-in-use',
					credential,
					email,
				};
			}
			return { status: 'error', message: 'This Google account is already in use.' };
		}
		if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
			return { status: 'cancelled' };
		}
		return {
			status: 'error',
			message: (err as Error).message || 'Google sign-in failed.',
		};
	}
}

/**
 * The first-run Google choice. Picks the right mechanism for the current
 * session state:
 * - anonymous session present: linkWithPopup upgrades it in place, so the
 *   uid - and every poll membership, nomination, ballot and host role tied
 *   to it - carries over;
 * - no session at all (the normal first-run case): a plain Google sign-in,
 *   so NO anonymous account is ever created for this visitor;
 * - already Google-linked: a no-op.
 *
 * A credential-already-in-use collision is only possible on the link path;
 * a fresh sign-in with an existing Google account simply recovers that
 * identity. Cancellation and errors map to the same result type as
 * linkGoogleAccount.
 */
export async function continueWithGoogle(): Promise<LinkGoogleResult> {
	await authReady;
	const current = auth.currentUser;
	if (current) return linkGoogleAccount();
	try {
		const result = await signInWithPopup(auth, provider);
		return { status: 'linked', user: result.user };
	} catch (err) {
		const code = (err as { code?: string }).code;
		if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
			return { status: 'cancelled' };
		}
		return {
			status: 'error',
			message: (err as Error).message || 'Google sign-in failed.',
		};
	}
}

/**
 * Signs in with a Google credential that is already linked to another user.
 * Only call this after the user explicitly confirms the identity switch.
 * The current anonymous identity and its poll participation are left intact
 * under the old uid, but anonymous accounts have no recovery credential:
 * this browser permanently loses access to that identity (including host
 * roles on polls it created) and starts acting as the Google one.
 */
export async function switchToGoogleCredential(credential: AuthCredential): Promise<User> {
	const result = await signInWithCredential(auth, credential);
	return result.user;
}


/**
 * Picks the display name to use right after Google sign-in or linking: the
 * Google profile name, falling back to the email's local part. The name
 * stays editable afterwards through the usual name-edit UI.
 */
export function googleDisplayName(user: { displayName: string | null; email: string | null }): string {
	const name = user.displayName?.trim();
	if (name) return name;
	const localPart = user.email?.split('@')[0]?.trim();
	return localPart || 'Guest';
}

/** Subscribes to auth identity changes. Returns unsubscribe. */
export function observeIdentity(
	callback: (identity: { uid: string; isAnonymous: boolean; email: string | null } | null) => void,
): () => void {
	return onAuthStateChanged(auth, (user) => {
		callback(user ? { uid: user.uid, isAnonymous: user.isAnonymous, email: user.email } : null);
	});
}
