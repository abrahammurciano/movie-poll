/**
 * useKnownPolls – live summaries of every poll this device knows about.
 *
 * Subscribes to each known poll's Firestore documents so the home page list
 * stays up to date. Polls that no longer exist are dropped from the list.
 */

import { useEffect, useState } from 'react';
import { authReady } from '@/lib/firebase';
import { subscribePoll, type PollDocs } from '@/lib/pollStore';
import { computeState } from '@/lib/pollState';
import { getKnownPolls, forgetPoll } from '@/lib/knownPolls';
import type { Phase } from '@/types';

export interface PollSummary {
	code: string;
	phase: Phase;
	winnerTitles: string[];
}

export function useKnownPolls(): { summaries: PollSummary[]; dismiss: (code: string) => void } {
	const [summaries, setSummaries] = useState<PollSummary[]>([]);

	useEffect(() => {
		const codes = getKnownPolls();
		const cleanups: Array<() => void> = [];
		let cancelled = false;

		authReady.then((uid) => {
			if (cancelled) return;
			for (const code of codes) {
				let latest: PollDocs | null = null;
				const update = () => {
					if (!latest || latest.poll === undefined) return;
					if (latest.poll === null) {
						// Poll is gone (never created or deleted): stop tracking it.
						forgetPoll(code);
						setSummaries((prev) => prev.filter((s) => s.code !== code));
						return;
					}
					const state = computeState(
						latest.poll,
						latest.participants,
						latest.nominations,
						latest.ballots,
					);
					setSummaries((prev) => {
						const next = prev.filter((s) => s.code !== code);
						next.push({ code, phase: state.phase, winnerTitles: state.winner.map((m) => m.title) });
						next.sort((a, b) => codes.indexOf(a.code) - codes.indexOf(b.code));
						return [...next];
					});
				};
				void uid;
				cleanups.push(subscribePoll(code, (docs) => {
					latest = docs;
					update();
				}));
			}
		});

		return () => {
			cancelled = true;
			cleanups.forEach((fn) => fn());
		};
	}, []);

	function dismiss(code: string) {
		forgetPoll(code);
		setSummaries((prev) => prev.filter((s) => s.code !== code));
	}

	return { summaries, dismiss };
}
