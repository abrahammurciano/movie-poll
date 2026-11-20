import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
const cfgSrc = readFileSync(new URL('../src/lib/firebaseConfig.ts', import.meta.url), 'utf8');
const grab = (k) => cfgSrc.match(new RegExp(`${k}: "([^"]+)"`))[1];
const app = initializeApp({ apiKey: grab('apiKey'), authDomain: grab('authDomain'), projectId: grab('projectId'), appId: grab('appId') });
await signInAnonymously(getAuth(app));
const db = getFirestore(app);
for (const code of ['XY28Y1', 'TQKOMI']) {
	const snap = await getDoc(doc(db, 'polls', code));
	console.log(code, snap.exists() ? 'STILL EXISTS' : 'deleted');
}
process.exit(0);
