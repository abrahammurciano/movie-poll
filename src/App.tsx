import { useState, useEffect } from 'react';
import { AccountChoiceOverlay } from '@/components/AccountChoiceOverlay';
import { HomePage } from '@/pages/HomePage';
import { PollPage } from '@/pages/PollPage';
import { storageKey } from '@/lib/identity';
import { rememberPoll } from '@/lib/knownPolls';
import { requireUser } from '@/lib/firebase';
import { getUserProfile } from '@/lib/pollStore';

interface Session {
	pollCode: string;
	displayName: string;
	autoShare: boolean;
	isHost: boolean;
}

function readStoredDisplayName() {
	return localStorage.getItem(storageKey('displayName'))?.trim() ?? '';
}

function writeStoredDisplayName(name: string) {
	if (!name.trim()) return;
	localStorage.setItem(storageKey('displayName'), name.trim());
}

function isStoredHost(pollCode: string): boolean {
	return localStorage.getItem(storageKey(`host.${pollCode}`)) === '1';
}

function codeFromPath(): string | null {
	const match = window.location.hash.match(/^#\/([A-Z0-9]{6})$/i);
	return match ? match[1].toUpperCase() : null;
}

function App() {
	const [nameReady, setNameReady] = useState(() => Boolean(readStoredDisplayName()));
	const [adoptedName, setAdoptedName] = useState<string | null>(null);
	const [session, setSession] = useState<Session | null>(() => {
		const code = codeFromPath();
		return code ? { pollCode: code, displayName: readStoredDisplayName(), autoShare: false, isHost: isStoredHost(code) } : null;
	});

	useEffect(() => {
		if (session) rememberPoll(session.pollCode);
	}, [session]);

	// Adopt the canonical name from the account-level registry (users/{uid}):
	// a rename made on another device or in a cleared browser is picked up
	// here, and from it flows into every open poll via the rename effect.
	useEffect(() => {
		let alive = true;
		void requireUser()
			.then((u) => getUserProfile(u.uid))
			.then((profile) => {
				if (!alive || !profile?.name) return;
				if (profile.name !== readStoredDisplayName()) {
					writeStoredDisplayName(profile.name);
					setAdoptedName(profile.name);
					setSession((s) => (s ? { ...s, displayName: profile.name! } : s));
				}
			})
			.catch(() => {
				// Registry unavailable (e.g. rules not yet deployed): the
				// stored local name stays in effect.
			});
		return () => {
			alive = false;
		};
	}, []);

	useEffect(() => {
		const onPop = () => {
			const code = codeFromPath();
			if (!code) setSession(null);
			else if (!session || session.pollCode !== code)
				setSession({ pollCode: code, displayName: readStoredDisplayName(), autoShare: false, isHost: isStoredHost(code) });
		};
		window.addEventListener('popstate', onPop);
		return () => window.removeEventListener('popstate', onPop);
	}, [session]);

	function handleAccountChoice(displayName: string) {
		writeStoredDisplayName(displayName);
		setNameReady(true);
		// A direct invite link already produced a session: carry the chosen
		// name into it so the poll page joins with the chosen identity.
		setSession((s) => (s ? { ...s, displayName } : s));
	}

	function handleJoin(pollCode: string, displayName: string, isCreator: boolean) {
		writeStoredDisplayName(displayName);
		if (isCreator) localStorage.setItem(storageKey(`host.${pollCode}`), '1');
		const s = new URLSearchParams(window.location.search).get('session');
		const qs = s && s !== '0' ? `?session=${s}` : '';
		history.pushState(null, '', `${qs}#/${pollCode}`);
		setSession({ pollCode, displayName, autoShare: isCreator, isHost: isCreator });
	}

	// First-run gate: no account of any kind exists yet, and no page (and
	// therefore no poll read, create or join) mounts until the visitor makes
	// a conscious choice. Returning visitors never see this: they have a
	// stored name and their session restores from IndexedDB.
	if (!nameReady) {
		return <AccountChoiceOverlay onDone={handleAccountChoice} />;
	}

	if (session) {
		return (
			<PollPage
				pollCode={session.pollCode}
				displayName={session.displayName}
				autoShare={session.autoShare}
				isHost={session.isHost}
				onLeave={() => {
					const session = new URLSearchParams(window.location.search).get('session');
					const qs = session && session !== '0' ? `?session=${session}` : '';
					history.pushState(null, '', `${qs}#`);
					setSession(null);
				}}
			/>
		);
	}

	return <HomePage onJoin={handleJoin} initialCode={null} initialName={adoptedName ?? readStoredDisplayName()} />;
}

export default App
