import { ChevronDown, X } from 'lucide-react';
import type { Movie } from '@/types';
import type { IrvRound, RoundCount } from '@/lib/voting';

const GREEN = 'oklch(0.8 0.12 160)';

interface Row {
	movie: Movie;
	count: RoundCount;
	/** Round this movie was eliminated in, or null if it was still in the race at the end. */
	outRound: number | null;
}

const votesOf = (c: RoundCount) => c.primary + c.transferred;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function breakdown(c: RoundCount): string {
	return c.transferred > 0
		? `${c.primary} first-choice + ${c.transferred} transferred`
		: `${plural(c.primary, 'first-choice vote')}`;
}

/**
 * Instant-runoff results: who finished where, with each movie's votes in the
 * round it finished (split into first-choice and transferred), plus an
 * optional round-by-round view. Totals come from different rounds, so they
 * are deliberately not presented as one tally.
 */
export function IrvResults({ movies, rounds }: { movies: Movie[]; rounds: IrvRound[] }) {
	if (rounds.length === 0) return null;
	const byId = new Map(movies.map((m) => [m.id, m]));
	const last = rounds[rounds.length - 1];

	const rows: Row[] = [];
	for (const c of [...last.counts].filter((c) => !last.eliminated.includes(c.id)).sort((a, b) => votesOf(b) - votesOf(a))) {
		const movie = byId.get(c.id);
		if (movie) rows.push({ movie, count: c, outRound: null });
	}
	// Latest eliminations finish highest; within a round, more votes first
	for (const r of [...rounds].reverse()) {
		const out = r.counts
			.filter((c) => r.eliminated.includes(c.id))
			.sort((a, b) => votesOf(b) - votesOf(a));
		for (const c of out) {
			const movie = byId.get(c.id);
			if (movie) rows.push({ movie, count: c, outRound: r.round });
		}
	}

	const totalBallots = rounds[0].counts.reduce((n, c) => n + votesOf(c), 0) + rounds[0].exhausted;
	const max = Math.max(1, ...rows.map((r) => votesOf(r.count)));
	const gone = rounds.reduce((n, r) => n + r.eliminated.length, 0);
	const summary =
		rounds.length === 1
			? `Won outright in round 1: more than half of the ${plural(totalBallots, 'ballot')}.`
			: `${plural(gone, 'movie')} eliminated over ${plural(rounds.length - 1, 'round')}, then the final round decided it.`;

	return (
		<div className="w-full space-y-3 text-left">
			<div>
				<p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
					How it played out
				</p>
				<p className="mt-1 text-xs text-muted-foreground">{summary}</p>
			</div>

			<ol className="space-y-3">
				{rows.map((row, i) => {
					const v = votesOf(row.count);
					const dim = row.outRound !== null;
					return (
						<li key={row.movie.id} className={dim ? 'opacity-70' : ''}>
							<div className="flex items-baseline justify-between gap-2 min-w-0">
								<span className="truncate text-sm font-medium">
									<span className="mr-1.5 text-xs text-muted-foreground">{i + 1}.</span>
									{row.movie.title}
								</span>
								<span
									className="flex-shrink-0 text-xs font-semibold"
									style={{ color: dim ? undefined : GREEN }}
								>
									{plural(v, 'vote')}
								</span>
							</div>
							<div className="mt-1 flex h-2 overflow-hidden rounded-full bg-white/5">
								<div style={{ background: dim ? 'oklch(1 0 0 / 0.45)' : GREEN, width: `${(row.count.primary / max) * 100}%` }} />
								<div style={{ background: dim ? 'oklch(1 0 0 / 0.22)' : 'oklch(0.8 0.12 160 / 0.4)', width: `${(row.count.transferred / max) * 100}%` }} />
							</div>
							<p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
								{row.outRound !== null && <X className="h-3 w-3" aria-hidden="true" />}
								{row.outRound !== null ? `Out in round ${row.outRound}` : `Final round (${rounds.length})`}
								{' · '}
								{breakdown(row.count)}
							</p>
						</li>
					);
				})}
			</ol>

			{rounds.length > 1 && (
				<p className="text-[11px] leading-snug text-muted-foreground">
					Each total is the movie's votes in the round it finished, so the numbers come from different rounds and don't add up to one tally. Transferred votes come from ballots whose higher choices had been eliminated.
				</p>
			)}

			<details className="group rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
				<summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-muted-foreground">
					Round by round
					<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
				</summary>
				<div className="mt-3 space-y-3">
					{rounds.map((r) => (
						<div key={r.round}>
							<p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
								Round {r.round}
							</p>
							<ul className="mt-1 space-y-0.5">
								{[...r.counts].sort((a, b) => votesOf(b) - votesOf(a)).map((c) => (
									<li key={c.id} className="flex items-center justify-between gap-2 text-xs">
										<span className="flex min-w-0 items-center gap-1 truncate">
											{r.eliminated.includes(c.id) && <X className="h-3 w-3 flex-shrink-0 text-muted-foreground" aria-hidden="true" />}
											<span className={`truncate ${r.eliminated.includes(c.id) ? 'text-muted-foreground line-through' : ''}`}>
												{byId.get(c.id)?.title ?? c.id}
											</span>
										</span>
										<span className="flex-shrink-0 tabular-nums text-muted-foreground">{votesOf(c)}</span>
									</li>
								))}
							</ul>
							{r.tieBreak && r.eliminated.length > 0 && (
								<p className="mt-1 text-[11px] text-muted-foreground">
									Tied for fewest votes; the movie ranked lower across all ballots went out.
								</p>
							)}
							{r.exhausted > 0 && (
								<p className="mt-1 text-[11px] text-muted-foreground">
									{plural(r.exhausted, 'ballot')} had no choices left and didn't count this round.
								</p>
							)}
						</div>
					))}
				</div>
			</details>
		</div>
	);
}
