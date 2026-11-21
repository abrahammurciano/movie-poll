/**
 * useKnownPolls – live summaries of every poll the user belongs to.
 *
 * The account-level registry (users/{uid}) is the single source of truth
 * for the list, so the home page shows polls joined on any device with no
 * local history to drift out of sync. Subscribes to each poll's Firestore
 * documents so the list stays up to date. Polls that no longer exist are
 * dropped from the list and unregistered.
 */

import { useEffect, useRef, useState } from 'react';
import { requireUser } from '@/lib/firebase';
import { getUserProfile, setPollArchived, subscribePoll, unregisterPoll, type PollDocs } from '@/lib/pollStore';
import { computeState } from '@/lib/pollState';
import type { Phase } from '@/types';

export interface PollSummary {
	code: string;
	phase: Phase;
	winnerTitles: string[];
	/** Host-chosen poll title, when set. */
	title?: string;
	/** Hidden from the main list by the user (restorable). */
	archived: boolean;
}

export function useKnownPolls(): {
	summaries: PollSummary[];
	dismiss: (code: string) => void;
	setArchived: (code: string, archived: boolean) => void;
} {
	const [summaries, setSummaries] = useState<PollSummary[]>([]);
	const selfIdRef = useRef('');
	const [archivedCodes, setArchivedCodes] = useState<Set<string>>(new Set());

	useEffect(() => {
		const cleanups: Array<() => void> = [];
		let cancelled = false;

		requireUser().then(async (user) => {
			if (cancelled) return;
			selfIdRef.current = user.uid;
			let codes: string[] = [];
			try {
				const profile = await getUserProfile(user.uid);
				codes = profile?.polls ?? [];
				setArchivedCodes(new Set(profile?.archived ?? []));
			} catch {
				// Registry unavailable (offline): nothing to list yet; the
				// app requires connectivity for Firestore anyway.
			}
			if (cancelled) return;
			for (const code of codes) {
				let latest: PollDocs | null = null;
				const update = () => {
					if (!latest || latest.poll === undefined) return;
					const poll = latest.poll;
					if (poll === null) {
						// Poll is gone (never created or deleted): stop tracking it.
						if (selfIdRef.current) {
							unregisterPoll(selfIdRef.current, code).catch(() => {});
						}
						setSummaries((prev) => prev.filter((s) => s.code !== code));
						return;
					}
					const state = computeState(
						poll,
						latest.participants,
						latest.nominations,
						latest.ballots,
					);
					setSummaries((prev) => {
						const next = prev.filter((s) => s.code !== code);
						next.push({ code, phase: state.phase, winnerTitles: state.winner.map((m) => m.title), title: poll.settings?.title, archived: false });
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
		if (selfIdRef.current) {
			unregisterPoll(selfIdRef.current, code).catch((e) =>
				console.warn('registry dismiss failed', e),
			);
		}
		setSummaries((prev) => prev.filter((s) => s.code !== code));
	}

	function setArchived(code: string, archived: boolean) {
		const before = archivedCodes.has(code);
		const apply = (on: boolean) =>
			setArchivedCodes((prev) => {
				const next = new Set(prev);
				if (on) next.add(code);
				else next.delete(code);
				return next;
			});
		apply(archived);
		if (!selfIdRef.current) return;
		// Firestore is the source of truth: roll the optimistic change back
		// if the write is rejected.
		setPollArchived(selfIdRef.current, code, archived).catch((e) => {
			console.warn('archive write failed', e);
			apply(before);
		});
	}

	const withArchived = summaries.map((s) => ({ ...s, archived: archivedCodes.has(s.code) }));
	return { summaries: withArchived, dismiss, setArchived };
}
