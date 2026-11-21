/**
 * Firestore data layer for polls.
 *
 * Layout:
 *   polls/{code}                    -> { hostId, phase, createdAt, settings }
 *   polls/{code}/participants/{uid} -> { name, joinedAt }
 *   polls/{code}/nominations/{uid}  -> { movies: MovieData[] }
 *   polls/{code}/ballots/{uid}      -> { ranking: string[] }
 *   users/{uid}                     -> { name?, polls: { [code]: true } }
 *                                      (account-level registry: canonical
 *                                      name + every poll joined, so renames
 *                                      reach other devices too)
 *
 * All authorization (who may create, join, nominate, vote, advance the phase
 * or remove someone) is enforced server-side by firestore.rules. This module
 * only ever issues the writes a well-behaved client needs; anything else is
 * rejected by the backend, not merely hidden in the UI.
 */

import {
	collection,
	deleteField,
	doc,
	getDoc,
	onSnapshot,
	setDoc,
	updateDoc,
	writeBatch,
	type DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Movie, Phase, PollSettings } from '@/types';
import type { Ballots, NominationsByUser, Participants, PollDoc } from '@/lib/pollState';

export interface PollDocs {
	/** undefined = still loading, null = poll does not exist */
	poll: PollDoc | null | undefined;
	participants: Participants;
	nominations: NominationsByUser;
	ballots: Ballots;
	/** false until every subscription has delivered its first snapshot */
	ready: boolean;
	/** true once the poll document itself came from the server (not the local cache) */
	pollConfirmed: boolean;
	/** set when any subscription failed; the data is then incomplete and must not be shown as the poll */
	error: string | null;
}

const polls = collection(db, 'polls');

export function pollRef(code: string) {
	return doc(polls, code);
}
export function participantRef(code: string, uid: string) {
	return doc(polls, code, 'participants', uid);
}
export function nominationsRef(code: string, uid: string) {
	return doc(polls, code, 'nominations', uid);
}
export function ballotRef(code: string, uid: string) {
	return doc(polls, code, 'ballots', uid);
}
export function userRef(uid: string) {
	return doc(db, 'users', uid);
}

function toPollDoc(data: DocumentData): PollDoc {
	return {
		hostId: data.hostId,
		phase: data.phase,
		createdAt: data.createdAt,
		settings: data.settings,
	};
}

/** Subscribe to everything that defines a poll. Fires on every change. */
export function subscribePoll(code: string, cb: (docs: PollDocs) => void): () => void {
	const docs: PollDocs = { poll: undefined, participants: {}, nominations: {}, ballots: {}, ready: false, pollConfirmed: false, error: null };
	const seen = new Set<string>();
	// A snapshot served from the local cache (e.g. while offline, where it is
	// empty) is not the poll: only a server-confirmed first snapshot, or a
	// failed subscription, settles a source. Later updates are always emitted.
	const emit = (source: string, settled = true) => {
		if (settled) seen.add(source);
		docs.ready = seen.size === 4;
		cb({ ...docs });
	};
	// A failed subscription still counts as settled so the page never spins forever.
	const onError = (what: string) => (error: unknown) => {
		console.error(`poll ${code}: ${what} subscription failed`, error);
		docs.error = `${what} subscription failed`;
		emit(what);
	};

	const unsubs = [
		onSnapshot(pollRef(code), (snap) => {
			docs.poll = snap.exists() ? toPollDoc(snap.data()) : null;
			if (!snap.metadata.fromCache) docs.pollConfirmed = true;
			emit('poll', !snap.metadata.fromCache);
		}, onError('poll')),
		onSnapshot(collection(polls, code, 'participants'), (snap) => {
			docs.participants = Object.fromEntries(
				snap.docs.map((d) => [d.id, { name: d.data().name as string }]),
			);
			emit('participants', !snap.metadata.fromCache);
		}, onError('participants')),
		onSnapshot(collection(polls, code, 'nominations'), (snap) => {
			docs.nominations = Object.fromEntries(
				snap.docs.map((d) => [d.id, (d.data().movies ?? []) as Array<Omit<Movie, 'nominatedBy'>>]),
			);
			emit('nominations', !snap.metadata.fromCache);
		}, onError('nominations')),
		onSnapshot(collection(polls, code, 'ballots'), (snap) => {
			docs.ballots = Object.fromEntries(
				snap.docs.map((d) => [d.id, (d.data().ranking ?? []) as string[]]),
			);
			emit('ballots', !snap.metadata.fromCache);
		}, onError('ballots')),
	];
	return () => unsubs.forEach((u) => u());
}

/** Create a poll. Fails (by rules) if the code exists or hostId != caller. */
export async function createPoll(
	code: string,
	uid: string,
	settings: Omit<PollSettings, 'hostId'>,
): Promise<void> {
	await setDoc(pollRef(code), {
		hostId: uid,
		phase: 'nominations' satisfies Phase,
		createdAt: Date.now(),
		settings: { hostId: uid, ...settings },
	});
}

/**
 * Set, edit or clear the poll's title (host only; the rules enforce this).
 * Writes only settings.title, so it cannot touch any other poll state, and
 * the change syncs live to every participant's poll page and home list.
 * Pass null (or an empty string) to clear the title.
 */
export async function setPollTitle(code: string, title: string | null): Promise<void> {
	const trimmed = title?.trim() ?? '';
	await updateDoc(pollRef(code), {
		'settings.title': trimmed ? trimmed.slice(0, 100) : deleteField(),
	});
}

/** Join a poll as the signed-in user. Only used for the initial join: it
 * resets joinedAt, so renames go through renameParticipant instead. */
export async function joinPoll(code: string, uid: string, name: string): Promise<void> {
	await setDoc(participantRef(code, uid), { name, joinedAt: Date.now() });
}

/**
 * Rename in a poll the user already joined. The rules allow a participant to
 * update only their own name, and everyone subscribed to the poll sees the
 * new name live.
 */
export async function renameParticipant(code: string, uid: string, name: string): Promise<void> {
	await updateDoc(participantRef(code, uid), { name });
}

/** Remove a poll from the account-level registry (e.g. dismissed on the
 * home page, or the poll no longer exists). */
export async function unregisterPoll(uid: string, code: string): Promise<void> {
	await setDoc(userRef(uid), { polls: { [code]: deleteField() } }, { merge: true });
}

export interface UserProfile {
	name?: string;
	polls: string[];
	/** Codes the account has hidden from its own "Your polls" list. */
	archived: string[];
}

/** Hide (or restore) a poll in the account's own "Your polls" list. Only the
 * account's registry changes; the poll itself and other participants are
 * untouched. */
export async function setPollArchived(uid: string, code: string, archived: boolean): Promise<void> {
	await setDoc(
		userRef(uid),
		{ archived: { [code]: archived ? true : deleteField() } },
		{ merge: true },
	);
}

/** Read the account-level registry doc (users/{uid}). null when absent. */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
	const snap = await getDoc(userRef(uid));
	if (!snap.exists()) return null;
	const data = snap.data();
	return {
		name: typeof data.name === 'string' ? data.name : undefined,
		polls: Object.keys(data.polls ?? {}),
		archived: Object.keys(data.archived ?? {}),
	};
}

/**
 * Remember a poll in the account-level registry, so name changes reach
 * polls joined on other devices or before this browser stored history.
 * The registry's name is written only when the doc is first created;
 * renames update it through renameEverywhere, so a device with a stale
 * local name cannot clobber the canonical one by joining a new poll.
 */
export async function registerPoll(uid: string, code: string, name: string): Promise<void> {
	const existing = await getDoc(userRef(uid)).catch(() => null);
	if (existing?.exists()) {
		await setDoc(userRef(uid), { polls: { [code]: true } }, { merge: true });
	} else {
		await setDoc(userRef(uid), { name, polls: { [code]: true } }, { merge: true });
	}
}

/**
 * Propagates a name change so it is global rather than local: the shared
 * participant record is updated in every poll the account has joined (from
 * the users/{uid} registry, covering every device), and the registry's
 * canonical name is updated too. Everyone subscribed to any of those polls
 * sees the new name live. Polls where the user is not (or no longer) a
 * participant are skipped by the rules and settled quietly.
 */
export async function renameEverywhere(uid: string, name: string): Promise<void> {
	let codes: string[] = [];
	try {
		const profile = await getUserProfile(uid);
		codes = profile?.polls ?? [];
	} catch {
		// Registry unreadable (offline): the name is still applied to the
		// currently open poll by usePoll's rename effect.
	}
	await Promise.allSettled([
		...codes.map((code) => renameParticipant(code, uid, name)),
		setDoc(userRef(uid), { name }, { merge: true }),
	]);
}

export async function setNominations(
	code: string,
	uid: string,
	movies: Array<Omit<Movie, 'nominatedBy'>>,
): Promise<void> {
	await setDoc(nominationsRef(code, uid), { movies });
}

export async function setBallot(code: string, uid: string, ranking: string[]): Promise<void> {
	await setDoc(ballotRef(code, uid), { ranking });
}

/** Advance the phase one step. Only the host's write passes the rules. */
export async function advancePollPhase(code: string, from: Phase): Promise<void> {
	const to: Phase = from === 'nominations' ? 'voting' : 'results';
	await updateDoc(pollRef(code), { phase: to });
}

/** Host-only removal: deletes the person, their nominations and their ballot. */
export async function revokeParticipant(code: string, uid: string): Promise<void> {
	const batch = writeBatch(db);
	batch.delete(participantRef(code, uid));
	batch.delete(nominationsRef(code, uid));
	batch.delete(ballotRef(code, uid));
	await batch.commit();
}
