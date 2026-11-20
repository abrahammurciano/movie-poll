/**
 * Local preference storage helpers.
 *
 * Identity itself comes from Firebase anonymous auth (see firebase.ts); the
 * uid it issues is the user's peerId in every poll. This module owns the
 * localStorage namespace for the app's own preferences.
 *
 * All keys are prefixed with the repo name (`movie-poll.`) so this app does
 * not share localStorage with other apps hosted on the same origin (e.g.
 * movie-night-polls on *.github.io). Legacy `mnp.*` and bare `pollSettings.*`
 * keys from before this namespacing are left completely untouched: this app
 * starts fresh as a separate app and never reads or deletes the other app's
 * data. storageKey() additionally namespaces by ?session=N so multiple tabs
 * can hold separate local preferences during development.
 */

const PREFIX = 'movie-poll.';

function sessionSuffix(): string {
	const s = new URLSearchParams(window.location.search).get('session');
	return s && s !== '0' ? `.s${s}` : '';
}

export function storageKey(key: string): string {
	return `${PREFIX}${key}${sessionSuffix()}`;
}

/**
 * The display-name cache. The account-level registry (users/{uid}) is the
 * source of truth for the name; this mirrors it so the app can greet and
 * prefill instantly before Firestore responds. All reads and writes of the
 * cached name go through these helpers so there is exactly one key.
 */
export function loadDisplayName(): string {
	return localStorage.getItem(storageKey('displayName'))?.trim() ?? '';
}

export function saveDisplayName(name: string): void {
	if (!name.trim()) return;
	localStorage.setItem(storageKey('displayName'), name.trim());
}
