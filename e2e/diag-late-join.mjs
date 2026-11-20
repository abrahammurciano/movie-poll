import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, getDoc, collection, getDocs } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
const cfgSrc = readFileSync(new URL('/home/sandbox/movie-night-polls/src/lib/firebaseConfig.ts', import.meta.url), 'utf8');
const grab = (k) => cfgSrc.match(new RegExp(`${k}: "([^"]+)"`))[1];
const config = { apiKey: grab('apiKey'), authDomain: grab('authDomain'), projectId: grab('projectId'), appId: grab('appId') };

async function newUser(name) {
	const app = initializeApp(config, name + Math.random());
	const auth = getAuth(app);
	const cred = await signInAnonymously(auth);
	return { app, db: getFirestore(app), uid: cred.user.uid };
}
const CODE = Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[^A-Z0-9]/g, 'X');

const host = await newUser('h');
await setDoc(doc(host.db, 'polls', CODE), {
	hostId: host.uid, phase: 'nominations', createdAt: Date.now(),
	settings: { hostId: host.uid, maxNominationsPerUser: 2, deadlineMinutes: 10080, votingMethod: 'irv' },
});
await setDoc(doc(host.db, 'polls', CODE, 'participants', host.uid), { name: 'Host', joinedAt: Date.now() });
await setDoc(doc(host.db, 'polls', CODE, 'nominations', host.uid), { movies: [{ id: 'm1', title: 'M1' }] });
await updateDoc(doc(host.db, 'polls', CODE), { phase: 'voting' });
await setDoc(doc(host.db, 'polls', CODE, 'ballots', host.uid), { ranking: ['m1'] });
await updateDoc(doc(host.db, 'polls', CODE), { phase: 'results' });

const late = await newUser('l');
await setDoc(doc(late.db, 'polls', CODE, 'participants', late.uid), { name: 'Late', joinedAt: Date.now() });
const pollSnap = await getDoc(doc(late.db, 'polls', CODE));
const parts = await getDocs(collection(late.db, 'polls', CODE, 'participants'));
console.log('CODE=' + CODE);
console.log('late-joiner sees phase:', pollSnap.data()?.phase, '| participants:', parts.size);
await Promise.all([host.app, late.app].map((a) => deleteApp(a).catch(() => {})));
process.exit(0);
