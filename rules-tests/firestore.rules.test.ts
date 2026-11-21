/**
 * Firestore security rules tests.
 *
 * These run against the Firestore emulator (see `npm run test:rules`) and
 * prove that the backend itself — not the UI — rejects actions a user is not
 * allowed to perform.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, beforeEach, afterAll, describe, it } from 'vitest';
import {
	assertFails,
	assertSucceeds,
	initializeTestEnvironment,
	type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-movie-poll';
const CODE = 'ABC123';

let testEnv: RulesTestEnvironment;

const movie = (id: string) => ({ id, title: `Movie ${id}`, tmdbId: 42 });

function seedPoll(settings: Record<string, unknown> = {}) {
	return testEnv.withSecurityRulesDisabled(async (context) => {
		const db = context.firestore();
		await setDoc(doc(db, 'polls', CODE), {
			hostId: 'host',
			phase: 'nominations',
			createdAt: Date.now(),
			settings: {
				hostId: 'host',
				maxNominationsPerUser: 2,
				deadlineMinutes: 10080,
				votingMethod: 'irv',
				...settings,
			},
		});
	});
}

function join(code: string, uid: string, name = uid) {
	return setDoc(doc(testEnv.authenticatedContext(uid).firestore(), 'polls', code, 'participants', uid), {
		name,
		joinedAt: Date.now(),
	});
}

async function setPhase(phase: 'nominations' | 'voting' | 'results') {
	await testEnv.withSecurityRulesDisabled(async (context) => {
		await updateDoc(doc(context.firestore(), 'polls', CODE), { phase });
	});
}

beforeAll(async () => {
	testEnv = await initializeTestEnvironment({
		projectId: PROJECT_ID,
		firestore: {
			rules: readFileSync(fileURLToPath(new URL('../firestore.rules', import.meta.url)), 'utf8'),
		},
	});
});

beforeEach(async () => {
	await testEnv.clearFirestore();
});

afterAll(async () => {
	await testEnv.cleanup();
});

describe('poll creation', () => {
	it('lets a signed-in user create a poll they host', async () => {
		const db = testEnv.authenticatedContext('host').firestore();
		await assertSucceeds(
			setDoc(doc(db, 'polls', CODE), {
				hostId: 'host',
				phase: 'nominations',
				createdAt: Date.now(),
				settings: { hostId: 'host', maxNominationsPerUser: 1 },
			}),
		);
	});

	it('rejects unauthenticated access', async () => {
		const db = testEnv.unauthenticatedContext().firestore();
		await assertFails(getDoc(doc(db, 'polls', CODE)));
		await assertFails(
			setDoc(doc(db, 'polls', CODE), {
				hostId: 'host',
				phase: 'nominations',
				createdAt: Date.now(),
				settings: { hostId: 'host', maxNominationsPerUser: 1 },
			}),
		);
	});

	it('rejects creating a poll hosted by someone else', async () => {
		const db = testEnv.authenticatedContext('mallory').firestore();
		await assertFails(
			setDoc(doc(db, 'polls', CODE), {
				hostId: 'host',
				phase: 'nominations',
				createdAt: Date.now(),
				settings: { hostId: 'host', maxNominationsPerUser: 1 },
			}),
		);
	});

	it('rejects a poll created directly in a later phase', async () => {
		const db = testEnv.authenticatedContext('host').firestore();
		await assertFails(
			setDoc(doc(db, 'polls', CODE), {
				hostId: 'host',
				phase: 'voting',
				createdAt: Date.now(),
				settings: { hostId: 'host', maxNominationsPerUser: 1 },
			}),
		);
	});

	it('rejects bogus settings', async () => {
		const db = testEnv.authenticatedContext('host').firestore();
		await assertFails(
			setDoc(doc(db, 'polls', CODE), {
				hostId: 'host',
				phase: 'nominations',
				createdAt: Date.now(),
				settings: { hostId: 'host', maxNominationsPerUser: 0 },
			}),
		);
		await assertFails(
			setDoc(doc(db, 'polls', 'XYZ99'), {
				hostId: 'host',
				phase: 'nominations',
				createdAt: Date.now(),
				settings: { hostId: 'host', maxNominationsPerUser: 1, votingMethod: 'rigged' },
			}),
		);
	});
});

describe('phase transitions', () => {
	beforeEach(() => seedPoll());

	it('lets the host advance one step at a time', async () => {
		const db = testEnv.authenticatedContext('host').firestore();
		await assertSucceeds(updateDoc(doc(db, 'polls', CODE), { phase: 'voting' }));
		await assertSucceeds(updateDoc(doc(db, 'polls', CODE), { phase: 'results' }));
	});

	it('rejects phase changes by non-hosts', async () => {
		const db = testEnv.authenticatedContext('mallory').firestore();
		await assertFails(updateDoc(doc(db, 'polls', CODE), { phase: 'voting' }));
	});

	it('rejects skipping a phase', async () => {
		const db = testEnv.authenticatedContext('host').firestore();
		await assertFails(updateDoc(doc(db, 'polls', CODE), { phase: 'results' }));
	});

	it('rejects the host editing settings or transferring host', async () => {
		const db = testEnv.authenticatedContext('host').firestore();
		await assertFails(
			updateDoc(doc(db, 'polls', CODE), { 'settings.maxNominationsPerUser': 99 }),
		);
		await assertFails(updateDoc(doc(db, 'polls', CODE), { hostId: 'mallory' }));
	});
});

describe('poll title', () => {
	beforeEach(() => seedPoll());

	it('can be set at creation when valid', async () => {
		const db = testEnv.authenticatedContext('host').firestore();
		await assertSucceeds(
			setDoc(doc(db, 'polls', 'NEW001'), {
				hostId: 'host',
				phase: 'nominations',
				createdAt: Date.now(),
				settings: {
					hostId: 'host',
					maxNominationsPerUser: 1,
					deadlineMinutes: 10080,
					votingMethod: 'irv',
					title: 'Friday Movie Night',
				},
			}),
		);
	});

	it('rejects bogus titles at creation', async () => {
		const db = testEnv.authenticatedContext('host').firestore();
		const attempt = (title: unknown) =>
			setDoc(doc(db, 'polls', 'NEW002'), {
				hostId: 'host',
				phase: 'nominations',
				createdAt: Date.now(),
				settings: {
					hostId: 'host',
					maxNominationsPerUser: 1,
					deadlineMinutes: 10080,
					votingMethod: 'irv',
					title,
				},
			});
		await assertFails(attempt(''));
		await assertFails(attempt('x'.repeat(101)));
		await assertFails(attempt(42));
	});

	it('lets the host set, edit and clear the title after creation', async () => {
		const db = testEnv.authenticatedContext('host').firestore();
		await assertSucceeds(updateDoc(doc(db, 'polls', CODE), { 'settings.title': 'Friday Movie Night' }));
		await assertSucceeds(updateDoc(doc(db, 'polls', CODE), { 'settings.title': 'Saturday Movie Night' }));
		await assertSucceeds(updateDoc(doc(db, 'polls', CODE), { 'settings.title': deleteField() }));
	});

	it('rejects title edits by non-hosts', async () => {
		const db = testEnv.authenticatedContext('mallory').firestore();
		await assertFails(updateDoc(doc(db, 'polls', CODE), { 'settings.title': 'Hijacked' }));
	});

	it('rejects invalid title edits and smuggled settings changes', async () => {
		const db = testEnv.authenticatedContext('host').firestore();
		await assertFails(updateDoc(doc(db, 'polls', CODE), { 'settings.title': '' }));
		await assertFails(updateDoc(doc(db, 'polls', CODE), { 'settings.title': 'x'.repeat(101) }));
		// The title path must not become a backdoor to edit other settings.
		await assertFails(
			updateDoc(doc(db, 'polls', CODE), {
				'settings.title': 'Fine',
				'settings.maxNominationsPerUser': 99,
			}),
		);
	});
});

describe('participants', () => {
	beforeEach(() => seedPoll());

	it('lets a user join as themselves only', async () => {
		await assertSucceeds(join(CODE, 'alice', 'Alice'));
		const db = testEnv.authenticatedContext('alice').firestore();
		await assertFails(
			setDoc(doc(db, 'polls', CODE, 'participants', 'bob'), { name: 'Bob', joinedAt: Date.now() }),
		);
	});

	it('lets a user rename themselves but not touch other fields', async () => {
		await join(CODE, 'alice', 'Alice');
		const db = testEnv.authenticatedContext('alice').firestore();
		const ref = doc(db, 'polls', CODE, 'participants', 'alice');
		await assertSucceeds(updateDoc(ref, { name: 'Al' }));
		await assertFails(updateDoc(ref, { joinedAt: 1 }));
	});

	it('lets the host remove someone, but not another participant', async () => {
		await join(CODE, 'alice', 'Alice');
		await join(CODE, 'bob', 'Bob');
		const bobDb = testEnv.authenticatedContext('bob').firestore();
		await assertFails(deleteDoc(doc(bobDb, 'polls', CODE, 'participants', 'alice')));
		const hostDb = testEnv.authenticatedContext('host').firestore();
		await assertSucceeds(deleteDoc(doc(hostDb, 'polls', CODE, 'participants', 'alice')));
	});
});

describe('nominations', () => {
	beforeEach(() => seedPoll());

	it('lets a participant nominate within the limit', async () => {
		await join(CODE, 'alice');
		const db = testEnv.authenticatedContext('alice').firestore();
		await assertSucceeds(
			setDoc(doc(db, 'polls', CODE, 'nominations', 'alice'), {
				movies: [movie('m1'), movie('m2')],
			}),
		);
	});

	it('rejects nominations over the per-user limit', async () => {
		await join(CODE, 'alice');
		const db = testEnv.authenticatedContext('alice').firestore();
		await assertFails(
			setDoc(doc(db, 'polls', CODE, 'nominations', 'alice'), {
				movies: [movie('m1'), movie('m2'), movie('m3')],
			}),
		);
	});

	it("rejects writing another user's nominations", async () => {
		await join(CODE, 'alice');
		const db = testEnv.authenticatedContext('alice').firestore();
		await assertFails(
			setDoc(doc(db, 'polls', CODE, 'nominations', 'bob'), { movies: [movie('m1')] }),
		);
	});

	it('rejects nominations from non-participants', async () => {
		const db = testEnv.authenticatedContext('mallory').firestore();
		await assertFails(
			setDoc(doc(db, 'polls', CODE, 'nominations', 'mallory'), { movies: [movie('m1')] }),
		);
	});

	it('rejects nominations after voting starts', async () => {
		await join(CODE, 'alice');
		await setPhase('voting');
		const db = testEnv.authenticatedContext('alice').firestore();
		await assertFails(
			setDoc(doc(db, 'polls', CODE, 'nominations', 'alice'), { movies: [movie('m1')] }),
		);
	});

	it('rejects malformed movies', async () => {
		await join(CODE, 'alice');
		const db = testEnv.authenticatedContext('alice').firestore();
		await assertFails(
			setDoc(doc(db, 'polls', CODE, 'nominations', 'alice'), {
				movies: [{ id: 'm1' }], // no title
			}),
		);
		await assertFails(
			setDoc(doc(db, 'polls', CODE, 'nominations', 'alice'), {
				movies: [{ ...movie('m1'), hack: true }],
			}),
		);
	});

	it('lets the host remove a nomination list, not another participant', async () => {
		await join(CODE, 'alice');
		await join(CODE, 'bob');
		const aliceDb = testEnv.authenticatedContext('alice').firestore();
		await setDoc(doc(aliceDb, 'polls', CODE, 'nominations', 'alice'), { movies: [movie('m1')] });
		const bobDb = testEnv.authenticatedContext('bob').firestore();
		await assertFails(deleteDoc(doc(bobDb, 'polls', CODE, 'nominations', 'alice')));
		const hostDb = testEnv.authenticatedContext('host').firestore();
		await assertSucceeds(deleteDoc(doc(hostDb, 'polls', CODE, 'nominations', 'alice')));
	});
});

describe('ballots', () => {
	beforeEach(async () => {
		await seedPoll();
		await join(CODE, 'alice');
		await join(CODE, 'bob');
	});

	it('rejects voting before the voting phase', async () => {
		const db = testEnv.authenticatedContext('alice').firestore();
		await assertFails(
			setDoc(doc(db, 'polls', CODE, 'ballots', 'alice'), { ranking: ['m1'] }),
		);
	});

	it('lets a participant vote during voting', async () => {
		await setPhase('voting');
		const db = testEnv.authenticatedContext('alice').firestore();
		await assertSucceeds(
			setDoc(doc(db, 'polls', CODE, 'ballots', 'alice'), { ranking: ['m1', 'm2'] }),
		);
	});

	it("rejects writing another user's ballot", async () => {
		await setPhase('voting');
		const db = testEnv.authenticatedContext('alice').firestore();
		await assertFails(
			setDoc(doc(db, 'polls', CODE, 'ballots', 'bob'), { ranking: ['m2'] }),
		);
	});

	it('rejects duplicate entries in a ranking', async () => {
		await setPhase('voting');
		const db = testEnv.authenticatedContext('alice').firestore();
		await assertFails(
			setDoc(doc(db, 'polls', CODE, 'ballots', 'alice'), { ranking: ['m1', 'm1'] }),
		);
	});

	it('rejects voting after results', async () => {
		await setPhase('results');
		const db = testEnv.authenticatedContext('alice').firestore();
		await assertFails(
			setDoc(doc(db, 'polls', CODE, 'ballots', 'alice'), { ranking: ['m1'] }),
		);
	});

	it('lets the host remove a ballot, not another participant', async () => {
		await setPhase('voting');
		const aliceDb = testEnv.authenticatedContext('alice').firestore();
		await setDoc(doc(aliceDb, 'polls', CODE, 'ballots', 'alice'), { ranking: ['m1'] });
		const bobDb = testEnv.authenticatedContext('bob').firestore();
		await assertFails(deleteDoc(doc(bobDb, 'polls', CODE, 'ballots', 'alice')));
		const hostDb = testEnv.authenticatedContext('host').firestore();
		await assertSucceeds(deleteDoc(doc(hostDb, 'polls', CODE, 'ballots', 'alice')));
	});
});

describe('reads', () => {
	beforeEach(() => seedPoll());

	it('lets any signed-in user with the code read the poll', async () => {
		const db = testEnv.authenticatedContext('mallory').firestore();
		await assertSucceeds(getDoc(doc(db, 'polls', CODE)));
	});
});

describe('archived polls registry', () => {
	const userDoc = (uid: string, as = uid) =>
		doc(testEnv.authenticatedContext(as).firestore(), 'users', uid);

	it('lets an account archive and unarchive its own polls', async () => {
		await assertSucceeds(setDoc(userDoc('u1'), { polls: { [CODE]: true } }, { merge: true }));
		await assertSucceeds(setDoc(userDoc('u1'), { archived: { [CODE]: true } }, { merge: true }));
		await assertSucceeds(
			setDoc(userDoc('u1'), { archived: { [CODE]: deleteField() } }, { merge: true }),
		);
	});

	it('rejects archived values other than true', async () => {
		await assertFails(setDoc(userDoc('u1'), { archived: { [CODE]: false } }, { merge: true }));
		await assertFails(setDoc(userDoc('u1'), { archived: [CODE] }, { merge: true }));
	});

	it("rejects writing another account's archive list", async () => {
		await assertFails(setDoc(userDoc('u1', 'u2'), { archived: { [CODE]: true } }, { merge: true }));
	});

	it('still rejects unknown fields', async () => {
		await assertFails(setDoc(userDoc('u1'), { other: true }, { merge: true }));
	});
});
