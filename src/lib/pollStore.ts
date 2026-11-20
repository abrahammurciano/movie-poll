/**
 * Firestore data layer for polls.
 *
 * Layout:
 *   polls/{code}                    -> { hostId, phase, createdAt, settings }
 *   polls/{code}/participants/{uid} -> { name, joinedAt }
 *   polls/{code}/nominations/{uid}  -> { movies: MovieData[] }
 *   polls/{code}/ballots/{uid}      -> { ranking: string[] }
 *
 * All authorization (who may create, join, nominate, vote, advance the phase
 * or remove someone) is enforced server-side by firestore.rules. This module
 * only ever issues the writes a well-behaved client needs; anything else is
 * rejected by the backend, not merely hidden in the UI.
 */

import {
	collection,
	doc,
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
	const docs: PollDocs = { poll: undefined, participants: {}, nominations: {}, ballots: {} };
	const emit = () => cb({ ...docs });
	const onError = (what: string) => (error: unknown) =>
		console.error(`poll ${code}: ${what} subscription failed`, error);

	const unsubs = [
		onSnapshot(pollRef(code), (snap) => {
			docs.poll = snap.exists() ? toPollDoc(snap.data()) : null;
			emit();
		}, onError('poll')),
		onSnapshot(collection(polls, code, 'participants'), (snap) => {
			docs.participants = Object.fromEntries(
				snap.docs.map((d) => [d.id, { name: d.data().name as string }]),
			);
			emit();
		}, onError('participants')),
		onSnapshot(collection(polls, code, 'nominations'), (snap) => {
			docs.nominations = Object.fromEntries(
				snap.docs.map((d) => [d.id, (d.data().movies ?? []) as Array<Omit<Movie, 'nominatedBy'>>]),
			);
			emit();
		}, onError('nominations')),
		onSnapshot(collection(polls, code, 'ballots'), (snap) => {
			docs.ballots = Object.fromEntries(
				snap.docs.map((d) => [d.id, (d.data().ranking ?? []) as string[]]),
			);
			emit();
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

/** Join (or re-join / rename in) a poll as the signed-in user. */
export async function joinPoll(code: string, uid: string, name: string): Promise<void> {
	await setDoc(participantRef(code, uid), { name, joinedAt: Date.now() });
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
