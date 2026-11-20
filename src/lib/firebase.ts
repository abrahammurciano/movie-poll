/**
 * Firebase app singleton.
 *
 * The uid Firebase Auth issues is the visitor's identity (peerId) inside
 * every poll, and Firestore security rules key all write authorization off
 * request.auth.uid, so identity is enforced server-side rather than by the UI.
 *
 * No account is created until the visitor explicitly chooses one: a
 * first-time visitor is shown the account-choice gate (Google vs anonymous)
 * BEFORE any sign-in happens, so nothing - not even an inert anonymous
 * account - is decided for them. Returning browsers skip the gate: their
 * session (anonymous or Google-linked) is restored from IndexedDB.
 */

import { initializeApp } from 'firebase/app';
import {
	connectAuthEmulator,
	getAuth,
	onAuthStateChanged,
	signInAnonymously,
	type Auth,
	type User,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { firebaseConfig } from '@/lib/firebaseConfig';

export const firebaseApp = initializeApp(firebaseConfig);
export const auth: Auth = getAuth(firebaseApp);
export const db: Firestore = getFirestore(firebaseApp);

if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === '1') {
	connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
	connectFirestoreEmulator(db, '127.0.0.1', 8180);
}

/**
 * Resolves once with the RESTORED session, or null for a first-time visitor.
 * Never signs anyone in: anonymous sign-in only happens on the visitor's
 * explicit choice (ensureAnonymousUser). The first onAuthStateChanged
 * emission always follows the persistence restore, so it is the safe point
 * to learn whether this browser already has an identity.
 */
export const authReady: Promise<User | null> = new Promise((resolve, reject) => {
	const unsubscribe = onAuthStateChanged(
		auth,
		(user) => {
			unsubscribe();
			resolve(user);
		},
		(error) => {
			unsubscribe();
			reject(error);
		},
	);
});

/**
 * Resolves once a signed-in user actually exists. For a returning visitor
 * this is immediate; for a first-time visitor it pends until they complete
 * the explicit account choice (Google sign-in or anonymous creation).
 * Firestore readers/writers must wait for this, so no poll read, create or
 * join can happen before the choice.
 */
export async function requireUser(): Promise<User> {
	const restored = await authReady;
	if (restored) return restored;
	return new Promise((resolve, reject) => {
		const unsubscribe = onAuthStateChanged(
			auth,
			(user) => {
				if (user) {
					unsubscribe();
					resolve(user);
				}
			},
			(error) => {
				unsubscribe();
				reject(error);
			},
		);
	});
}

/**
 * Creates the anonymous account - but only when the visitor explicitly
 * picked the anonymous option. If a session already exists (restored, or
 * just created by a Google sign-in), it is returned untouched.
 */
export async function ensureAnonymousUser(): Promise<User> {
	await authReady;
	if (auth.currentUser) return auth.currentUser;
	return (await signInAnonymously(auth)).user;
}
