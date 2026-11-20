/**
 * LIVE rules verification against the deployed Firebase project.
 *
 * Complements rules-tests/ (which run against the emulator): this script
 * signs in real anonymous users to the LIVE project and attempts forbidden
 * actions directly, verifying the DEPLOYED rules reject them. A poll created
 * here is cleaned up afterwards with the Firebase CLI.
 *
 * Run: node e2e/live-rules-check.mjs
 */

import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
	getFirestore, doc, setDoc, updateDoc, getDoc, writeBatch, collection,
} from 'firebase/firestore';
import { firebaseConfig } from '../src/lib/firebaseConfig.ts';

// vite-style TS import won't run in node; inline the config instead.
import { readFileSync } from 'node:fs';
const cfgSrc = readFileSync(new URL('../src/lib/firebaseConfig.ts', import.meta.url), 'utf8');
const grab = (k) => cfgSrc.match(new RegExp(`${k}: "([^"]+)"`))[1];
const config = {
	apiKey: grab('apiKey'), authDomain: grab('authDomain'), projectId: grab('projectId'),
	storageBucket: grab('storageBucket'), messagingSenderId: grab('messagingSenderId'),
	appId: grab('appId'),
};

const results = [];
function record(name, ok, detail = '') {
	results.push({ name, ok, detail });
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}
const isDenied = (e) => e?.code === 'permission-denied' || /PERMISSION_DENIED|Missing or insufficient permissions/.test(String(e));

async function newUser() {
	const app = initializeApp(config, `u${Math.random()}`);
	const auth = getAuth(app);
	const cred = await signInAnonymously(auth);
	return { app, auth, db: getFirestore(app), uid: cred.user.uid };
}

const CODE = Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[^A-Z0-9]/g, 'X');

// Host creates a poll legitimately.
const host = await newUser();
await setDoc(doc(host.db, 'polls', CODE), {
	hostId: host.uid, phase: 'nominations', createdAt: Date.now(),
	settings: { hostId: host.uid, maxNominationsPerUser: 2, deadlineMinutes: 10080, votingMethod: 'irv' },
});
record('host creates poll (permitted)', true);

const guest = await newUser();

// Forbidden: guest advances the phase.
try {
	await updateDoc(doc(guest.db, 'polls', CODE), { phase: 'voting' });
	record('guest cannot advance phase', false, 'write succeeded');
} catch (e) { record('guest cannot advance phase', isDenied(e), e?.code); }

// Forbidden: guest removes the host (batch delete).
try {
	const b = writeBatch(guest.db);
	b.delete(doc(guest.db, 'polls', CODE, 'participants', host.uid));
	b.delete(doc(guest.db, 'polls', CODE, 'nominations', host.uid));
	b.delete(doc(guest.db, 'polls', CODE, 'ballots', host.uid));
	await b.commit();
	record('guest cannot remove host', false, 'batch succeeded');
} catch (e) { record('guest cannot remove host', isDenied(e), e?.code); }

// Permitted: guest joins and writes own documents.
await setDoc(doc(guest.db, 'polls', CODE, 'participants', guest.uid), { name: 'Guest', joinedAt: Date.now() });
await setDoc(doc(guest.db, 'polls', CODE, 'nominations', guest.uid), { movies: [{ id: 'm1', title: 'Test Movie' }] });
record('guest joins + nominates (permitted)', true);

// Forbidden: guest writes the host's ballot.
try {
	await setDoc(doc(guest.db, 'polls', CODE, 'ballots', host.uid), { ranking: ['m1'] });
	record("guest cannot write host's ballot", false, 'write succeeded');
} catch (e) { record("guest cannot write host's ballot", isDenied(e), e?.code); }

// Forbidden: guest overwrites poll settings.
try {
	await updateDoc(doc(guest.db, 'polls', CODE), { settings: { hostId: guest.uid } });
	record('guest cannot change settings/host', false, 'write succeeded');
} catch (e) { record('guest cannot change settings/host', isDenied(e), e?.code); }

// Forbidden: unauthenticated client reads the poll.
const anonApp = initializeApp(config, 'noauth');
const anonDb = getFirestore(anonApp);
try {
	await getDoc(doc(anonDb, 'polls', CODE));
	record('signed-out client cannot read poll', false, 'read succeeded');
} catch (e) { record('signed-out client cannot read poll', isDenied(e), e?.code); }

// Forbidden: stranger creates a poll owned by someone else.
try {
	await setDoc(doc(guest.db, 'polls', ('FAKE' + Math.random().toString(36).slice(2, 6).toUpperCase()).slice(0, 6).replace(/[^A-Z0-9]/g, 'Q')), {
		hostId: host.uid, phase: 'nominations', createdAt: Date.now(),
		settings: { hostId: host.uid, maxNominationsPerUser: 2, deadlineMinutes: 10080, votingMethod: 'irv' },
	});
	record('guest cannot create a poll as another host', false, 'write succeeded');
} catch (e) { record('guest cannot create a poll as another host', isDenied(e), e?.code); }

await Promise.all([host.app, guest.app, anonApp].map((a) => deleteApp(a).catch(() => {})));

const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0 ? `LIVE RULES OK (${results.length} checks)` : `LIVE RULES FAILURES: ${failed.length}`);
console.log(`CLEANUP_CODE=${CODE}`);
process.exit(failed.length === 0 ? 0 : 1);
