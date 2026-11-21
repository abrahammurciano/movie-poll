import { useState, useEffect } from 'react';
import { AccountChoiceOverlay } from '@/components/AccountChoiceOverlay';
import { HomePage } from '@/pages/HomePage';
import { PollPage } from '@/pages/PollPage';
import { loadDisplayName, saveDisplayName } from '@/lib/identity';
import { requireUser } from '@/lib/firebase';
import { getUserProfile } from '@/lib/pollStore';
import type { CreatePollSettings } from '@/lib/pollSettings';

interface Session {
	pollCode: string;
	displayName: string;
	autoShare: boolean;
	isHost: boolean;
	/** Settings from the creation click; used only if this browser creates the poll. */
	createSettings?: CreatePollSettings;
}

function codeFromPath(): string | null {
	const match = window.location.hash.match(/^#\/([A-Z0-9]{6})$/i);
	return match ? match[1].toUpperCase() : null;
}

function App() {
	const [nameReady, setNameReady] = useState(() => Boolean(loadDisplayName()));
	const [adoptedName, setAdoptedName] = useState<string | null>(null);
	const [session, setSession] = useState<Session | null>(() => {
		const code = codeFromPath();
		return code ? { pollCode: code, displayName: loadDisplayName(), autoShare: false, isHost: false } : null;
	});

	// Adopt the canonical name from the account-level registry (users/{uid}):
	// a rename made on another device or in a cleared browser is picked up
	// here, and from it flows into every open poll via the rename effect.
	// A visitor whose session restores from IndexedDB but whose localStorage
	// was cleared still has an account and a canonical name: the registry
	// restores the name and the first-run gate is skipped entirely.
	useEffect(() => {
		let alive = true;
		void requireUser()
			.then((u) => getUserProfile(u.uid))
			.then((profile) => {
				if (!alive || !profile?.name) return;
				if (profile.name !== loadDisplayName()) {
					saveDisplayName(profile.name);
					setAdoptedName(profile.name);
					setSession((s) => (s ? { ...s, displayName: profile.name! } : s));
				}
				setNameReady(true);
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
				setSession({ pollCode: code, displayName: loadDisplayName(), autoShare: false, isHost: false });
		};
		window.addEventListener('popstate', onPop);
		return () => window.removeEventListener('popstate', onPop);
	}, [session]);

	function handleAccountChoice(displayName: string) {
		saveDisplayName(displayName);
		setNameReady(true);
		// A direct invite link already produced a session: carry the chosen
		// name into it so the poll page joins with the chosen identity.
		setSession((s) => (s ? { ...s, displayName } : s));
	}

	function handleJoin(
		pollCode: string,
		displayName: string,
		isCreator: boolean,
		createSettings?: CreatePollSettings,
	) {
		saveDisplayName(displayName);
		const s = new URLSearchParams(window.location.search).get('session');
		const qs = s && s !== '0' ? `?session=${s}` : '';
		history.pushState(null, '', `${qs}#/${pollCode}`);
		// Creation settings travel in memory from the click to usePoll's
		// create effect; once the poll doc exists, Firestore is authoritative.
		setSession({ pollCode, displayName, autoShare: isCreator, isHost: isCreator, createSettings });
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
				createSettings={session.createSettings}
				onLeave={() => {
					const session = new URLSearchParams(window.location.search).get('session');
					const qs = session && session !== '0' ? `?session=${session}` : '';
					history.pushState(null, '', `${qs}#`);
					setSession(null);
				}}
			/>
		);
	}

	return <HomePage onJoin={handleJoin} initialCode={null} initialName={adoptedName ?? loadDisplayName()} />;
}

export default App
