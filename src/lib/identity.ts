/**
 * Local preference storage helpers.
 *
 * Identity itself comes from Firebase anonymous auth (see firebase.ts); the
 * uid it issues is the user's peerId in every poll. This module only keeps
 * the storageKey() namespacing by ?session=N so multiple tabs can hold
 * separate local preferences during development.
 */

function sessionSuffix(): string {
	const s = new URLSearchParams(window.location.search).get('session');
	return s && s !== '0' ? `.s${s}` : '';
}

export function storageKey(key: string): string {
	return `mnp.${key}${sessionSuffix()}`;
}
