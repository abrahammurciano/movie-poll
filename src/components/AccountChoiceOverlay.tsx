import { useState } from 'react';
import type { AuthCredential } from 'firebase/auth';
import {
	googleDisplayName,
	linkGoogleAccount,
	switchToGoogleCredential,
} from '@/lib/googleAuth';

interface Props {
	isCreator?: boolean;
	onDone: (displayName: string) => void;
}

/**
 * First-run account choice, shown when a user is about to join or share a
 * poll and has no name yet. The user picks consciously between a Google
 * account and a browser-local anonymous account before anything is decided
 * for them.
 *
 * Google uses linkWithPopup on the current anonymous identity, so choosing
 * Google upgrades the account in place: the uid, and with it every poll
 * membership, nomination, ballot and host role, carries over. The display
 * name is taken from the Google profile and stays editable afterwards.
 *
 * If the Google account already belongs to a different identity in this
 * app, nothing switches silently: the user confirms the identity switch
 * explicitly, with the consequences spelled out.
 */
export function AccountChoiceOverlay({ isCreator = false, onDone }: Props) {
	const [name, setName] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pendingSwitch, setPendingSwitch] = useState<{
		credential: AuthCredential;
		email: string | null;
	} | null>(null);

	async function handleGoogle() {
		setBusy(true);
		setError(null);
		const result = await linkGoogleAccount();
		if (result.status === 'linked') {
			onDone(googleDisplayName(result.user));
			return;
		}
		setBusy(false);
		if (result.status === 'already-in-use') {
			setPendingSwitch({ credential: result.credential, email: result.email });
		} else if (result.status === 'error') {
			setError(result.message);
		}
		// 'cancelled' needs nothing: the choice stays open.
	}

	async function confirmSwitch() {
		if (!pendingSwitch) return;
		setBusy(true);
		try {
			const user = await switchToGoogleCredential(pendingSwitch.credential);
			onDone(googleDisplayName(user));
		} catch (err) {
			setBusy(false);
			setPendingSwitch(null);
			setError((err as Error).message || 'Google sign-in failed.');
		}
	}

	function submitAnonymous() {
		const trimmed = name.trim();
		if (!trimmed) return;
		onDone(trimmed);
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4"
			style={{ background: 'oklch(0 0 0 / 0.7)', backdropFilter: 'blur(4px)' }}
		>
			<div className="glass-card w-full md:max-w-sm rounded-t-2xl md:rounded-2xl p-6 flex flex-col gap-5">
				<div>
					<p className="text-base font-semibold">
						{isCreator ? 'Your poll is ready!' : "You've been invited!"}
					</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Choose how you want to {isCreator ? 'share it' : 'join'}. This decides how your
						identity is kept.
					</p>
				</div>

				<div className="flex flex-col gap-2">
					<button
						className="w-full rounded-xl py-3 text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-40"
						style={{ background: 'oklch(0.8 0.12 160)', color: 'oklch(0.17 0.03 160)' }}
						onClick={handleGoogle}
						disabled={busy}
					>
						{busy ? 'Signing in…' : 'Continue with Google'}
					</button>
					<p className="text-xs text-muted-foreground">
						Your name comes from your Google account. Your polls, votes and host roles
						follow you across devices and browsers, and you can sign back in to recover
						them.
					</p>
				</div>

				<div className="flex items-center gap-3">
					<span className="h-px flex-1" style={{ background: 'oklch(1 0 0 / 15%)' }} />
					<span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
						or
					</span>
					<span className="h-px flex-1" style={{ background: 'oklch(1 0 0 / 15%)' }} />
				</div>

				<div className="flex flex-col gap-2">
					<div className="flex flex-col gap-3">
						<input
							className="cinema-input"
							placeholder="Your name"
							value={name}
							autoFocus
							onChange={(e) => setName(e.target.value)}
							onKeyDown={(e) => e.key === 'Enter' && submitAnonymous()}
						/>
						<button
							className="w-full rounded-xl py-3 text-sm font-medium transition-colors disabled:opacity-40 cursor-pointer"
							style={{ background: 'oklch(1 0 0 / 0.07)', color: 'oklch(1 0 0 / 0.85)' }}
							disabled={!name.trim() || busy}
							onClick={submitAnonymous}
						>
							{isCreator ? 'Continue without an account' : 'Join without an account'}
						</button>
					</div>
					<p className="text-xs text-muted-foreground">
						Quick and private, but your identity lives only in this browser. Clearing
						site data or switching devices permanently loses access to your polls and
						host controls. You can link a Google account later to keep them.
					</p>
				</div>

				{error && (
					<p className="text-xs" style={{ color: 'oklch(0.7 0.15 25)' }}>
						{error}
					</p>
				)}
			</div>

			{pendingSwitch && (
				<div
					className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4"
					style={{ background: 'oklch(0 0 0 / 0.6)', backdropFilter: 'blur(4px)' }}
					onClick={() => setPendingSwitch(null)}
				>
					<div
						className="glass-card w-full md:max-w-sm rounded-t-2xl md:rounded-2xl p-6 flex flex-col gap-4"
						onClick={(e) => e.stopPropagation()}
					>
						<p className="font-semibold text-base">Switch to this Google account?</p>
						<p className="text-sm text-muted-foreground">
							{pendingSwitch.email ?? 'This Google account'} has signed in to this app
							before. Switching signs this browser in as that existing identity.
						</p>
						<p className="text-sm text-muted-foreground">
							Your current anonymous identity's polls, nominations, votes and host
							roles stay saved under that identity; they are not transferred to the
							Google account.
						</p>
						<p className="text-sm text-muted-foreground">
							Important: there is no way to sign back in to an anonymous identity.
							After switching, this browser permanently loses access to it, including
							host controls on any polls it created.
						</p>
						<div className="flex gap-3">
							<button
								className="flex-1 rounded-xl py-2.5 text-sm font-medium"
								style={{ background: 'oklch(1 0 0 / 0.07)', color: 'oklch(1 0 0 / 0.7)' }}
								onClick={() => setPendingSwitch(null)}
							>
								Stay anonymous
							</button>
							<button
								className="flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-30"
								style={{ background: 'oklch(0.8 0.12 160)', color: 'oklch(0.17 0.03 160)' }}
								disabled={busy}
								onClick={confirmSwitch}
							>
								Switch
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
