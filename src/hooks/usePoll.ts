/**
 * usePoll – central hook that owns the Firestore-backed poll.
 *
 * Waits for the visitor's chosen identity (uid = their peer identity),
 * subscribes to the poll's documents, and exposes the derived PollState plus action
 * dispatchers. All writes go through Firestore security rules, so anything a
 * user is not allowed to do is rejected by the backend itself.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { requireUser } from '@/lib/firebase';
import {
	advancePollPhase,
	createPoll,
	joinPoll,
	renameParticipant,
	registerPoll,
	revokeParticipant,
	setBallot,
	setNominations,
	subscribePoll,
	type PollDocs,
} from '@/lib/pollStore';
import { computeState } from '@/lib/pollState';
import type { PollState } from '@/types';
import type { CreatePollSettings } from '@/lib/pollSettings';
import type { MovieData } from '@/components/MovieSearch';

export function usePoll(
	pollCode: string,
	displayName: string,
	isHost: boolean,
	createSettings?: Partial<CreatePollSettings>,
) {
	const [uid, setUid] = useState<string | null>(null);
	const registeredRef = useRef(false);
	const [docs, setDocs] = useState<PollDocs>({
		poll: undefined,
		participants: {},
		nominations: {},
		ballots: {},
	});

	useEffect(() => {
		let alive = true;
		requireUser().then((u) => alive && setUid(u.uid)).catch((e) => console.error('sign-in failed', e));
		return () => {
			alive = false;
		};
	}, []);

	// Subscribe once signed in (the rules require an authenticated reader).
	useEffect(() => {
		if (!uid) return;
		return subscribePoll(pollCode, setDocs);
	}, [uid, pollCode]);

	// Create the poll when arriving as its creator and it does not exist yet.
	// The settings come straight from the creation click (in memory), never
	// from storage: once the poll doc exists, Firestore is authoritative.
	useEffect(() => {
		if (!uid || !isHost || docs.poll !== null) return;
		const settings = {
			maxNominationsPerUser: 1,
			deadlineMinutes: 10080,
			votingMethod: 'irv' as const,
			...createSettings,
		};
		const title = createSettings?.title?.trim().slice(0, 100);
		if (!title) delete settings.title;
		createPoll(pollCode, uid, settings).catch((e) => console.error('create poll failed', e));
	}, [uid, isHost, pollCode, docs.poll, createSettings]);

	// Join once the poll exists. A later name change renames the shared
	// participant record (keeping joinedAt) so everyone sees the new name.
	useEffect(() => {
		if (!uid || !displayName || !docs.poll) return;
		const existing = docs.participants[uid];
		if (!existing) {
			void (async () => {
				try {
					await joinPoll(pollCode, uid, displayName);
				} catch (e) {
					console.error('join poll failed', e);
					return;
				}
				// Record the poll in the account-level registry (the single
				// source of truth for "my polls"). Best-effort: a failure
				// must not affect the join.
				registeredRef.current = true;
				registerPoll(uid, pollCode, displayName).catch((e) =>
					console.warn('poll registry write failed', e),
				);
			})();
		} else {
			if (existing.name !== displayName) {
				renameParticipant(pollCode, uid, displayName).catch((e) =>
					console.error('rename failed', e),
				);
			}
			// Already a participant (e.g. a poll joined before the registry
			// existed): make sure it is registered, once per page view.
			if (!registeredRef.current) {
				registeredRef.current = true;
				registerPoll(uid, pollCode, displayName).catch((e) =>
					console.warn('poll registry write failed', e),
				);
			}
		}
	}, [uid, displayName, pollCode, docs.poll, docs.participants]);

	const state: PollState = useMemo(
		() =>
			computeState(
				docs.poll ?? null,
				docs.participants,
				docs.nominations,
				docs.ballots,
			),
		[docs],
	);

	const selfId = uid ?? '';
	const amHost = uid !== null && state.hostId === uid;

	const nominateMovie = (movieData: MovieData) => {
		if (!uid) return;
		const mine = docs.nominations[uid] ?? [];
		void setNominations(pollCode, uid, [...mine, movieData]).catch((e) =>
			console.error('nomination rejected', e),
		);
	};

	const submitBallot = (ranking: string[]) => {
		if (!uid) return;
		void setBallot(pollCode, uid, ranking).catch((e) => console.error('ballot rejected', e));
	};

	const advancePhase = () => {
		if (!docs.poll) return;
		void advancePollPhase(pollCode, docs.poll.phase).catch((e) =>
			console.error('phase advance rejected', e),
		);
	};

	const revokePeer = (peerId: string) => {
		void revokeParticipant(pollCode, peerId).catch((e) => console.error('revoke rejected', e));
	};

	// Auto-close when every participant has voted (host's client performs the write).
	useEffect(() => {
		if (!amHost || state.phase !== 'voting') return;
		const peerCount = Object.keys(state.peers).length;
		const ballotCount = Object.keys(state.ballots).length;
		if (peerCount > 0 && ballotCount >= peerCount) advancePhase();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [amHost, state.phase, state.peers, state.ballots]);

	// Auto-close voting when the poll deadline passes (host's client performs the write).
	useEffect(() => {
		if (!amHost || state.phase !== 'voting' || state.createdAt === null) return;
		const deadlineMinutes = state.settings?.deadlineMinutes ?? 10080;
		const deadlineAt = state.createdAt + deadlineMinutes * 60_000;
		const close = () => {
			if (Date.now() >= deadlineAt) advancePhase();
		};
		close();
		const timer = setInterval(close, 30_000);
		return () => clearInterval(timer);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [amHost, state.phase, state.createdAt, state.settings]);

	return { state, selfId, nominateMovie, submitBallot, advancePhase, revokePeer };
}
