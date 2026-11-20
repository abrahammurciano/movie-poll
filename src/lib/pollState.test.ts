import { describe, expect, it } from 'vitest';
import { computeState, type PollDoc } from '@/lib/pollState';
import type { Movie } from '@/types';

function movie(id: string, tmdbId: number): Omit<Movie, 'nominatedBy'> {
	return { id, tmdbId, title: id };
}

function poll(overrides: Partial<PollDoc> = {}): PollDoc {
	return {
		hostId: 'host',
		phase: 'nominations',
		createdAt: 1,
		settings: { hostId: 'host', maxNominationsPerUser: 2 },
		...overrides,
	};
}

describe('computeState', () => {
	it('merges duplicate TMDB nominations and caps per-user lists', () => {
		const state = computeState(
			poll(),
			{ p1: { name: 'P1' }, p2: { name: 'P2' } },
			{
				p1: [movie('m1', 1), movie('m3', 2)],
				p2: [movie('m2', 1)],
				// 3 entries despite a cap of 2: the third must be ignored.
				p3: [movie('m4', 4), movie('m5', 5), movie('m6', 6)],
			},
			{},
		);

		expect(state.movies).toHaveLength(4);
		const merged = state.movies.find((m) => m.tmdbId === 1);
		expect(merged?.nominatedBy.sort()).toEqual(['p1', 'p2']);
		expect(state.movies.some((m) => m.id === 'm6')).toBe(false);
	});

	it('exposes host, phase and settings from the poll document', () => {
		const state = computeState(poll(), { host: { name: 'Host' } }, {}, {});
		expect(state.hostId).toBe('host');
		expect(state.phase).toBe('nominations');
		expect(state.settings?.maxNominationsPerUser).toBe(2);
		expect(state.peers.host.name).toBe('Host');
	});

	it('returns an empty state when the poll does not exist', () => {
		const state = computeState(null, {}, {}, {});
		expect(state.hostId).toBeNull();
		expect(state.phase).toBe('nominations');
		expect(state.movies).toHaveLength(0);
	});

	it('ignores ballots while nominating and counts them once voting', () => {
		const ballots = { p1: ['m1'], p2: ['m2'] };
		const nominating = computeState(poll(), {}, {}, ballots);
		expect(Object.keys(nominating.ballots)).toHaveLength(0);

		const voting = computeState(poll({ phase: 'voting' }), {}, {}, ballots);
		expect(voting.ballots).toEqual(ballots);
	});

	it('drops a revoked participant along with their movies and ballot', () => {
		// Revocation deletes the participant's documents, so they simply
		// disappear from the inputs.
		const before = computeState(
			poll({ phase: 'voting' }),
			{ p1: { name: 'P1' }, p2: { name: 'P2' } },
			{ p1: [movie('m1', 1)], p2: [movie('m2', 2)] },
			{ p1: ['m1', 'm2'], p2: ['m2', 'm1'] },
		);
		const after = computeState(
			poll({ phase: 'voting' }),
			{ p1: { name: 'P1' } },
			{ p1: [movie('m1', 1)] },
			{ p1: ['m1', 'm2'] },
		);
		expect(Object.keys(after.peers)).toEqual(['p1']);
		expect(after.movies.map((m) => m.id)).toEqual(['m1']);
		expect(Object.keys(after.ballots)).toEqual(['p1']);
		expect(before.movies).toHaveLength(2);
	});

	it('computes the winner only in the results phase', () => {
		const movies = { p1: [movie('m1', 1)], p2: [movie('m2', 2)] };
		const ballots = { p1: ['m1', 'm2'], p2: ['m1', 'm2'] };

		const voting = computeState(poll({ phase: 'voting' }), {}, movies, ballots);
		expect(voting.winner).toHaveLength(0);

		const results = computeState(poll({ phase: 'results' }), {}, movies, ballots);
		expect(results.winner.map((m) => m.id)).toEqual(['m1']);
	});

	it('honours the configured voting method at results', () => {
		const movies = { p1: [movie('m1', 1)], p2: [movie('m2', 2)], p3: [movie('m3', 3)] };
		const ballots = {
			p1: ['m1', 'm2', 'm3'],
			p2: ['m1', 'm3', 'm2'],
			p3: ['m2', 'm3', 'm1'],
		};
		const borda = computeState(
			poll({ phase: 'results', settings: { hostId: 'host', maxNominationsPerUser: 2, votingMethod: 'borda' } }),
			{},
			movies,
			ballots,
		);
		expect(borda.winner.map((m) => m.id)).toEqual(['m1']);
	});
});
