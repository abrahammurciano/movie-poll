/**
 * usePoll – central hook that owns the Firestore-backed poll.
 *
 * Signs the visitor in anonymously (uid = their peer identity), subscribes to
 * the poll's documents, and exposes the derived PollState plus action
 * dispatchers. All writes go through Firestore security rules, so anything a
 * user is not allowed to do is rejected by the backend itself.
 */

import { useEffect, useMemo, useState } from 'react';
import { authReady } from '@/lib/firebase';
import { storageKey } from '@/lib/identity';
import {
	advancePollPhase,
	createPoll,
	joinPoll,
	revokeParticipant,
	setBallot,
	setNominations,
	subscribePoll,
	type PollDocs,
} from '@/lib/pollStore';
import { computeState } from '@/lib/pollState';
import type { PollState } from '@/types';
import type { MovieData } from '@/components/MovieSearch';

export function usePoll(pollCode: string, displayName: string, isHost: boolean) {
	const [uid, setUid] = useState<string | null>(null);
	const [docs, setDocs] = useState<PollDocs>({
		poll: undefined,
		participants: {},
		nominations: {},
		ballots: {},
	});

	useEffect(() => {
		let alive = true;
		authReady.then((id) => alive && setUid(id)).catch((e) => console.error('sign-in failed', e));
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
	useEffect(() => {
		if (!uid || !isHost || docs.poll !== null) return;
		const stored = localStorage.getItem(storageKey(`pollSettings.${pollCode}`));
		const parsed = stored ? JSON.parse(stored) : {};
		const settings = {
			maxNominationsPerUser: 1,
			deadlineMinutes: 10080,
			votingMethod: 'irv' as const,
			...parsed,
		};
		createPoll(pollCode, uid, settings).catch((e) => console.error('create poll failed', e));
	}, [uid, isHost, pollCode, docs.poll]);

	// Join once the poll exists; a later name change re-joins to update it.
	useEffect(() => {
		if (!uid || !displayName || !docs.poll) return;
		const existing = docs.participants[uid];
		if (existing && existing.name === displayName) return;
		joinPoll(pollCode, uid, displayName).catch((e) => console.error('join poll failed', e));
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
