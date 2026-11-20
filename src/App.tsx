import { useState, useEffect } from 'react';
import { AccountChoiceOverlay } from '@/components/AccountChoiceOverlay';
import { HomePage } from '@/pages/HomePage';
import { PollPage } from '@/pages/PollPage';
import { storageKey } from '@/lib/identity';
import { rememberPoll } from '@/lib/knownPolls';

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
	const [session, setSession] = useState<Session | null>(() => {
		const code = codeFromPath();
		return code ? { pollCode: code, displayName: readStoredDisplayName(), autoShare: false, isHost: isStoredHost(code) } : null;
	});

	useEffect(() => {
		if (session) rememberPoll(session.pollCode);
	}, [session]);

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

	return <HomePage onJoin={handleJoin} initialCode={null} initialName={readStoredDisplayName()} />;
}

export default App
