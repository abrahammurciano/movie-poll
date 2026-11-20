/**
 * Firebase app singleton.
 *
 * Every visitor signs in anonymously; the resulting uid is their identity
 * (peerId) inside every poll. Firestore security rules key all write
 * authorization off request.auth.uid, so identity is enforced server-side
 * rather than by the UI.
 */

import { initializeApp } from 'firebase/app';
import {
	connectAuthEmulator,
	getAuth,
	onAuthStateChanged,
	signInAnonymously,
	type Auth,
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
 * Resolves once with the signed-in uid. The session is persisted in
 * IndexedDB, so a returning browser keeps the same uid (and thus its
 * identity in existing polls), including a Google-linked identity.
 *
 * Anonymous sign-in happens ONLY when no session was restored: calling it
 * eagerly would clobber a restored Google session with a fresh anonymous
 * account on every page load. The first onAuthStateChanged emission always
 * follows the persistence restore, so it is the safe decision point.
 */
export const authReady: Promise<string> = new Promise((resolve, reject) => {
	const unsubscribe = onAuthStateChanged(
		auth,
		(user) => {
			unsubscribe();
			if (user) {
				resolve(user.uid);
			} else {
				signInAnonymously(auth).then((cred) => resolve(cred.user.uid), reject);
			}
		},
		(error) => {
			unsubscribe();
			reject(error);
		},
	);
});
