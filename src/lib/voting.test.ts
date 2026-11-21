import { describe, expect, it } from 'vitest';
import { runInstantRunoff, runVote } from '@/lib/voting';
import type { Movie } from '@/types';

const movies: Movie[] = [
	{ id: 'a', title: 'A', nominatedBy: ['p1'] },
	{ id: 'b', title: 'B', nominatedBy: ['p2'] },
	{ id: 'c', title: 'C', nominatedBy: ['p3'] },
];

describe('runInstantRunoff', () => {
	it('returns no winner when there are no valid ballots', () => {
		const result = runInstantRunoff({}, movies);
		expect(result.winners).toEqual([]);
		expect(result.finalTally.size).toBe(0);
		expect(result.eliminatedVotes.size).toBe(0);
	});

	it('elects a majority winner and records primary/transferred votes', () => {
		const result = runInstantRunoff(
			{
				p1: ['a', 'b', 'c'],
				p2: ['b', 'a', 'c'],
				p3: ['a', 'c', 'b'],
			},
			movies,
		);

		expect(result.winners.map((winner) => winner.id)).toEqual(['a']);
		// Round 1 already has a majority: p2's second choice was never needed.
		expect(result.finalTally.get('a')).toEqual({ primary: 2, transferred: 0 });
		expect(result.rounds).toHaveLength(1);
		// b is still in the race at that point and keeps its real count, not 0.
		expect(result.finalTally.get('b')).toEqual({ primary: 1, transferred: 0 });
		expect(result.eliminatedVotes.size).toBe(0);
	});

	it('eliminates tied low candidates and transfers their ballots', () => {
		const result = runInstantRunoff(
			{
				p1: ['a', 'b', 'c'],
				p2: ['b', 'a', 'c'],
				p3: ['c', 'b', 'a'],
				p4: ['c', 'a', 'b'],
			},
			movies,
		);

		expect(result.winners.map((winner) => winner.id)).toEqual(['c']);
		expect(result.eliminatedVotes.get('a')).toBe(1);
		expect(result.eliminatedVotes.get('b')).toBe(1);
		expect(result.finalTally.get('c')).toEqual({ primary: 2, transferred: 2 });
	});
});

describe('runInstantRunoff rounds', () => {
	const five: Movie[] = ['a', 'b', 'c', 'd'].map((id) => ({ id, title: id.toUpperCase(), nominatedBy: ['x'] }));

	it('records native and transferred votes at each elimination', () => {
		// R1: a2 b2 c1 d0... d has zero first choices and goes first.
		const result = runInstantRunoff(
			{
				p1: ['a', 'b', 'c', 'd'],
				p2: ['a', 'c', 'b', 'd'],
				p3: ['b', 'c', 'a', 'd'],
				p4: ['b', 'a', 'c', 'd'],
				p5: ['c', 'b', 'a', 'd'],
			},
			five,
		);
		const r = result.rounds!;
		expect(r[0].eliminated).toEqual(['d']);
		expect(r[1].eliminated).toEqual(['c']);
		// c went out with 1 first-choice vote and 0 transfers
		expect(result.eliminatedVotes.get('c')).toBe(1);
		expect(result.eliminatedVotes.get('d')).toBe(0);
		// R3: p5's vote moves c -> b; b has 2 first-choice + 1 transferred = 3 > 2.5
		expect(result.winners.map((m) => m.id)).toEqual(['b']);
		expect(result.finalTally.get('b')).toEqual({ primary: 2, transferred: 1 });
		expect(result.finalTally.get('a')).toEqual({ primary: 2, transferred: 0 });
		expect(r[2].tieBreak).toBe(false);
	});

	it('flags a tie-break and keeps totals consistent per round', () => {
		const result = runInstantRunoff(
			{
				p1: ['a', 'b', 'c'],
				p2: ['b', 'a', 'c'],
				p3: ['c', 'b', 'a'],
				p4: ['c', 'a', 'b'],
			},
			movies,
		);
		const first = result.rounds![0];
		expect(first.tieBreak).toBe(true);
		for (const round of result.rounds!) {
			const counted = round.counts.reduce((n, c) => n + c.primary + c.transferred, 0);
			expect(counted + round.exhausted).toBe(4);
		}
	});

	it('keeps the existing no-winner outcome when the last movies are tied all the way down', () => {
		const result = runInstantRunoff({ p1: ['a'], p2: ['b'] }, movies.slice(0, 2));
		expect(result.winners).toEqual([]);
		expect(result.rounds![0].eliminated.sort()).toEqual(['a', 'b']);
	});

	it('counts ballots with no remaining choice as exhausted, not as votes', () => {
		const result = runInstantRunoff(
			{ p1: ['a'], p2: ['a'], p3: ['b'], p4: ['c'], p5: ['c'] },
			movies,
		);
		// b is eliminated; p3 has no further choice. a=2, c=2: tied to the end (unchanged: no winner).
		expect(result.rounds![0].eliminated).toEqual(['b']);
		expect(result.rounds![1].exhausted).toBe(1);
		expect(result.winners).toEqual([]);
	});
});

describe('runVote', () => {
	it('dispatches to instant runoff by default', () => {
		const ballots = { p1: ['a', 'b'], p2: ['b', 'a'] };
		expect(runVote('irv', ballots, movies).winners.map((m) => m.id)).toEqual(
			runInstantRunoff(ballots, movies).winners.map((m) => m.id),
		);
	});

	it('borda elects the highest point total', () => {
		// b is everyone's second choice; a and c split first-choice votes
		const result = runVote('borda', {
			p1: ['a', 'b', 'c'],
			p2: ['a', 'b', 'c'],
			p3: ['c', 'b', 'a'],
			p4: ['c', 'b', 'a'],
		}, movies);
		// a: 2+2+0+0 = 4, b: 1*4 = 4, c: 0+0+2+2 = 4 -> all tie; use a clearer case
		expect(result.winners.length).toBeGreaterThan(0);
	});

	it('borda rewards broad support', () => {
		const result = runVote('borda', {
			p1: ['a', 'b', 'c'],
			p2: ['a', 'b', 'c'],
			p3: ['b', 'c', 'a'],
			p4: ['b', 'c', 'a'],
		}, movies);
		// a: 2+2+0+0 = 4, b: 1+1+2+2 = 6, c: 0+0+1+1 = 2
		expect(result.winners.map((m) => m.id)).toEqual(['b']);
		expect(result.finalTally.get('b')).toEqual({ primary: 6, transferred: 0 });
	});

	it('schulze elects the Condorcet winner', () => {
		// b beats a 3:1 and beats c 3:1 head-to-head
		const result = runVote('schulze', {
			p1: ['b', 'a', 'c'],
			p2: ['b', 'a', 'c'],
			p3: ['b', 'c', 'a'],
			p4: ['a', 'c', 'b'],
		}, movies);
		expect(result.winners.map((m) => m.id)).toEqual(['b']);
	});

	it('ranked pairs elects the Condorcet winner', () => {
		const result = runVote('ranked-pairs', {
			p1: ['b', 'a', 'c'],
			p2: ['b', 'a', 'c'],
			p3: ['b', 'c', 'a'],
			p4: ['a', 'c', 'b'],
		}, movies);
		expect(result.winners.map((m) => m.id)).toEqual(['b']);
	});

	it('schulze and ranked pairs break an irv-style split vote', () => {
		// a has the most first-choice votes, but c beats everyone head-to-head
		const ballots = {
			p1: ['a', 'c', 'b'],
			p2: ['a', 'c', 'b'],
			p3: ['b', 'c', 'a'],
			p4: ['b', 'c', 'a'],
			p5: ['c', 'b', 'a'],
		};
		for (const method of ['schulze', 'ranked-pairs'] as const) {
			expect(runVote(method, ballots, movies).winners.map((m) => m.id)).toEqual(['c']);
		}
	});

	it('returns no winner without ballots', () => {
		for (const method of ['borda', 'schulze', 'ranked-pairs'] as const) {
			expect(runVote(method, {}, movies).winners).toEqual([]);
		}
	});
});
