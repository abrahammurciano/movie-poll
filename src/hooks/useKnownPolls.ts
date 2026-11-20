/**
 * useKnownPolls – live summaries of every poll the user belongs to.
 *
 * Sources the poll list from the account-level registry (users/{uid}), so
 * the home page shows polls joined on any device, merged with this device's
 * known-polls history. Subscribes to each poll's Firestore documents so the
 * list stays up to date. Polls that no longer exist are dropped from the
 * list (and from local history).
 */

import { useEffect, useRef, useState } from 'react';
import { requireUser } from '@/lib/firebase';
import { getUserProfile, subscribePoll, unregisterPoll, type PollDocs } from '@/lib/pollStore';
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
	const selfIdRef = useRef('');

	useEffect(() => {
		const cleanups: Array<() => void> = [];
		let cancelled = false;

		requireUser().then(async (user) => {
			if (cancelled) return;
			selfIdRef.current = user.uid;
			// Cloud registry first (covers polls joined on other devices),
			// merged with this device's history (covers anything not yet
			// registered, e.g. polls joined before the registry existed).
			let codes = getKnownPolls();
			try {
				const profile = await getUserProfile(user.uid);
				if (profile) codes = [...new Set([...profile.polls, ...codes])];
			} catch {
				// Registry unavailable (e.g. rules not yet deployed): the
				// device's own history still drives the list.
			}
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
				void user;
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
		if (selfIdRef.current) {
			unregisterPoll(selfIdRef.current, code).catch((e) =>
				console.warn('registry dismiss failed', e),
			);
		}
		setSummaries((prev) => prev.filter((s) => s.code !== code));
	}

	return { summaries, dismiss };
}
