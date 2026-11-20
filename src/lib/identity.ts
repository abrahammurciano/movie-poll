/**
 * Local preference storage helpers.
 *
 * Identity itself comes from Firebase anonymous auth (see firebase.ts); the
 * uid it issues is the user's peerId in every poll. This module owns the
 * localStorage namespace for the app's own preferences.
 *
 * All keys are prefixed with the repo name (`movie-poll.`) so this app does
 * not share localStorage with other apps hosted on the same origin (e.g.
 * movie-night-polls on *.github.io). storageKey() additionally namespaces by
 * ?session=N so multiple tabs can hold separate local preferences during
 * development.
 */

const PREFIX = 'movie-poll.';

/**
 * Set once the legacy import has run. Without it, every page load would keep
 * importing keys the other same-origin app writes later, and would resurrect
 * namespaced data the user deliberately removed (its legacy copy still
 * exists, so an absent namespaced key looks like one awaiting import).
 */
const MIGRATION_DONE = `${PREFIX}legacyMigrated`;

/**
 * Keys this app used before repo-name namespacing. `mnp.` was shared with
 * the movie-night-polls app on the same origin; bare `pollSettings.` keys
 * were unprefixed. Values are COPIED, never deleted: the other app may still
 * rely on the old keys, and removing them would silently erase its data.
 */
/**
 * Maps a legacy key to its new namespaced equivalent, or null if the key is
 * not a legacy key of this app. `mnp.` is replaced by the new prefix; the
 * bare `pollSettings.` keys move under the prefix whole.
 */
function legacyTarget(oldKey: string): string | null {
	if (oldKey.startsWith('mnp.')) return PREFIX + oldKey.slice('mnp.'.length);
	if (oldKey.startsWith('pollSettings.')) return PREFIX + oldKey;
	return null;
}

function migrateLegacyKeys(): void {
	if (typeof localStorage === 'undefined') return;
	if (localStorage.getItem(MIGRATION_DONE) !== null) return;
	// Collect first: writing during key() iteration mutates the index order.
	const moves: Array<[string, string]> = [];
	for (let i = 0; i < localStorage.length; i++) {
		const oldKey = localStorage.key(i);
		if (!oldKey) continue;
		const newKey = legacyTarget(oldKey);
		if (!newKey) continue;
		// Never clobber a value already written under the new namespace.
		if (localStorage.getItem(newKey) === null) moves.push([oldKey, newKey]);
	}
	for (const [oldKey, newKey] of moves) {
		const value = localStorage.getItem(oldKey);
		if (value !== null) localStorage.setItem(newKey, value);
	}
	localStorage.setItem(MIGRATION_DONE, '1');
}

migrateLegacyKeys();

function sessionSuffix(): string {
	const s = new URLSearchParams(window.location.search).get('session');
	return s && s !== '0' ? `.s${s}` : '';
}

export function storageKey(key: string): string {
	return `${PREFIX}${key}${sessionSuffix()}`;
}
