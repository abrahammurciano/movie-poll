import { useEffect, useState } from 'react';
import { GoogleLogo } from '@/components/GoogleLogo';
import type { AuthCredential } from 'firebase/auth';
import {
	linkGoogleAccount,
	observeIdentity,
	switchToGoogleCredential,
} from '@/lib/googleAuth';

type Identity = { uid: string; isAnonymous: boolean; email: string | null } | null;

/**
 * Optional Google sign-in, shown under the main card. Anonymous use stays the
 * default; this only appears as a quiet secondary action.
 */
export function GoogleSignIn() {
	const [identity, setIdentity] = useState<Identity>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pendingSwitch, setPendingSwitch] = useState<{
		credential: AuthCredential;
		email: string | null;
	} | null>(null);

	useEffect(() => observeIdentity(setIdentity), []);

	if (!identity) return null;

	if (!identity.isAnonymous) {
		return (
			<p className="mt-4 text-xs text-muted-foreground text-center">
				Signed in with Google{identity.email ? ` as ${identity.email}` : ''}
			</p>
		);
	}

	async function handleLink() {
		setBusy(true);
		setError(null);
		const result = await linkGoogleAccount();
		setBusy(false);
		if (result.status === 'already-in-use') {
			setPendingSwitch({ credential: result.credential, email: result.email });
		} else if (result.status === 'error') {
			setError(result.message);
		}
		// 'linked' and 'cancelled' need nothing: onAuthStateChanged updates the line.
	}

	async function confirmSwitch() {
		if (!pendingSwitch) return;
		setBusy(true);
		try {
			await switchToGoogleCredential(pendingSwitch.credential);
		} catch (err) {
			setError((err as Error).message || 'Google sign-in failed.');
		}
		setBusy(false);
		setPendingSwitch(null);
	}

	return (
		<div className="mt-4 text-center">
			<button
				className="inline-flex items-center gap-2.5 rounded-xl px-4 py-2 text-xs font-medium transition-all hover:shadow-md cursor-pointer disabled:opacity-40"
				style={{
					background: '#ffffff',
					color: '#1f1f1f',
					border: '1px solid #dadce0',
				}}
				onClick={handleLink}
				disabled={busy}
				title="Keep your identity across devices"
			>
				<GoogleLogo size={14} />
				{busy ? 'Signing in…' : 'Sign in with Google'}
			</button>
			<p className="mt-1.5 text-[11px] text-muted-foreground">
				Keep your identity across devices
			</p>
			{error && <p className="mt-2 text-xs" style={{ color: 'oklch(0.7 0.15 25)' }}>{error}</p>}

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
