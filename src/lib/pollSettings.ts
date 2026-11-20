/**
 * The user's preferred default poll settings, persisted in localStorage.
 *
 * Saved in real time as they are changed on the home page, and used as the
 * starting point the next time the user creates a poll.
 */

import { storageKey } from '@/lib/identity';
import type { VotingMethod } from '@/types';

export interface CreatePollSettings {
	/** Optional title for the poll being created. Never persisted as a default. */
	title?: string;
	maxNominationsPerUser: number;
	/** Minutes after poll creation when voting closes automatically. */
	deadlineMinutes: number;
	/** Method used to decide the winner. */
	votingMethod: VotingMethod;
}

export const DEFAULT_POLL_SETTINGS: CreatePollSettings = {
	maxNominationsPerUser: 1,
	deadlineMinutes: 10080, // 1 week
	votingMethod: 'irv',
};

const KEY = storageKey('pollDefaults');

export function loadPollSettings(): CreatePollSettings {
	try {
		const stored = localStorage.getItem(KEY);
		if (!stored) return { ...DEFAULT_POLL_SETTINGS };
		const parsed = JSON.parse(stored) as Partial<CreatePollSettings>;
		return { ...DEFAULT_POLL_SETTINGS, ...parsed };
	} catch {
		return { ...DEFAULT_POLL_SETTINGS };
	}
}

export function savePollSettings(settings: CreatePollSettings): void {
	// The title belongs to one poll, never to the reusable defaults.
	const { title: _title, ...defaults } = settings;
	localStorage.setItem(KEY, JSON.stringify(defaults));
}

export function settingsModified(settings: CreatePollSettings): boolean {
	return (
		settings.maxNominationsPerUser !== DEFAULT_POLL_SETTINGS.maxNominationsPerUser ||
		settings.deadlineMinutes !== DEFAULT_POLL_SETTINGS.deadlineMinutes ||
		settings.votingMethod !== DEFAULT_POLL_SETTINGS.votingMethod
	);
}
