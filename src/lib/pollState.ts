/**
 * Pure poll-state derivation.
 *
 * The Firestore layout (see pollStore.ts) is:
 *   polls/{code}                        -> PollDoc
 *   polls/{code}/participants/{uid}     -> { name, joinedAt }
 *   polls/{code}/nominations/{uid}      -> { movies: MovieData[] }
 *   polls/{code}/ballots/{uid}          -> { ranking: string[] }
 *
 * computeState reduces those documents into the same PollState shape the UI
 * consumed in the P2P version, so components don't care where the data lives.
 */

import type { Movie, Phase, PollSettings, PollState } from '@/types';
import { runVote } from '@/lib/voting';

export interface PollDoc {
	hostId: string;
	phase: Phase;
	createdAt: number;
	settings: PollSettings;
}

export type Participants = Record<string, { name: string }>;
export type NominationsByUser = Record<string, Array<Omit<Movie, 'nominatedBy'>>>;
export type Ballots = Record<string, string[]>;

export const EMPTY_STATE: PollState = {
	phase: 'nominations',
	hostId: null,
	createdAt: null,
	settings: null,
	peers: {},
	movies: [],
	ballots: {},
	winner: [],
	finalTally: new Map(),
	eliminatedVotes: new Map(),
};

/** Two nominations are the same movie when they share a TMDB id (or id). */
function sameMovie(a: Omit<Movie, 'nominatedBy'>, b: Omit<Movie, 'nominatedBy'>): boolean {
	if (a.tmdbId !== undefined && b.tmdbId !== undefined) return a.tmdbId === b.tmdbId;
	return a.id === b.id;
}

export function computeState(
	poll: PollDoc | null,
	participants: Participants,
	nominations: NominationsByUser,
	ballots: Ballots,
): PollState {
	if (!poll) return { ...EMPTY_STATE };

	const state: PollState = {
		...EMPTY_STATE,
		phase: poll.phase,
		hostId: poll.hostId,
		createdAt: poll.createdAt,
		settings: poll.settings,
		peers: { ...participants },
		ballots: {},
		movies: [],
	};

	// Merge every participant's nomination list, capping each user at the
	// poll's per-user limit (defence in depth; the security rules enforce it).
	const maxPerUser = poll.settings?.maxNominationsPerUser ?? 1;
	for (const [uid, movies] of Object.entries(nominations)) {
		for (const movie of movies.slice(0, maxPerUser)) {
			const existing = state.movies.find((m) => sameMovie(m, movie));
			if (existing) {
				if (!existing.nominatedBy.includes(uid)) existing.nominatedBy.push(uid);
			} else {
				state.movies.push({ ...movie, nominatedBy: [uid] });
			}
		}
	}

	if (poll.phase !== 'nominations') {
		state.ballots = { ...ballots };
	}

	if (poll.phase === 'results') {
		const result = runVote(poll.settings?.votingMethod ?? 'irv', state.ballots, state.movies);
		state.winner = result.winners;
		state.finalTally = result.finalTally;
		state.eliminatedVotes = result.eliminatedVotes;
	}

	return state;
}
