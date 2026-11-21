import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { SettingsModal } from '@/components/SettingsModal';
import { GoogleSignIn } from '@/components/GoogleSignIn';
import { requireUser } from '@/lib/firebase';
import { saveDisplayName } from '@/lib/identity';
import { renameEverywhere } from '@/lib/pollStore';
import { useKnownPolls } from '@/hooks/useKnownPolls';
import {
	loadPollSettings,
	savePollSettings,
	settingsModified,
	type CreatePollSettings,
} from '@/lib/pollSettings';

interface Props {
	onJoin: (pollCode: string, displayName: string, isCreator: boolean, createSettings?: CreatePollSettings) => void;
	initialCode?: string | null;
	initialName?: string | null;
}

function NameEditModal({ current, onSave, onCancel }: { current: string; onSave: (name: string) => void; onCancel: () => void }) {
	const [name, setName] = useState(current);
	return (
		<div
			className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4"
			style={{ background: 'oklch(0 0 0 / 0.6)', backdropFilter: 'blur(4px)' }}
			onClick={onCancel}
		>
			<div
				className="glass-card w-full md:max-w-sm rounded-t-2xl md:rounded-2xl p-6 flex flex-col gap-4"
				onClick={(e) => e.stopPropagation()}
			>
				<p className="font-semibold text-base">{current ? 'Change your name' : 'What should we call you?'}</p>
				<input
					className="cinema-input"
					placeholder="Your name"
					value={name}
					autoFocus
					onChange={(e) => setName(e.target.value)}
					onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onSave(name.trim()); }}
				/>
				<div className="flex gap-3">
					<button
						className="flex-1 rounded-xl py-2.5 text-sm font-medium"
						style={{ background: 'oklch(1 0 0 / 0.07)', color: 'oklch(1 0 0 / 0.7)' }}
						onClick={onCancel}
					>Cancel</button>
					<button
						className="flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-30"
						style={{ background: 'oklch(0.8 0.12 160)', color: 'oklch(0.17 0.03 160)' }}
						disabled={!name.trim()}
						onClick={() => name.trim() && onSave(name.trim())}
					>Save</button>
				</div>
			</div>
		</div>
	);
}

export function HomePage({ onJoin, initialCode, initialName }: Props) {
	const [name, setName] = useState(initialName ?? '');
	// Follow an externally adopted name (e.g. the account-level registry
	// resolving a canonical name set on another device).
	useEffect(() => {
		if (initialName) setName(initialName);
	}, [initialName]);
	const [nameEditOpen, setNameEditOpen] = useState(false);
	const [code, setCode] = useState(initialCode ?? '');
	const [settings, setSettings] = useState<CreatePollSettings>(loadPollSettings);
	const [showSettingsModal, setShowSettingsModal] = useState(false);
	const { summaries: knownPolls, dismiss: dismissPoll, setArchived } = useKnownPolls();
	const [showArchived, setShowArchived] = useState(false);
	const activePolls = knownPolls.filter((p) => !p.archived);
	const archivedPolls = knownPolls.filter((p) => p.archived);

	function updateSettings(next: CreatePollSettings) {
		setSettings(next);
		savePollSettings(next);
	}

	function saveName(next: string) {
		const trimmed = next.trim();
		if (!trimmed) return;
		setName(trimmed);
		saveDisplayName(trimmed);
		setNameEditOpen(false);
		// Global rename: update the shared participant record in every poll
		// this device knows, so everyone sees the new name.
		void requireUser().then((u) => renameEverywhere(u.uid, trimmed));
	}

	function handleCreate() {
		const newCode = Math.random().toString(36).slice(2, 8).toUpperCase();
		onJoin(newCode, name.trim(), true, settings);
		// The title belongs to the poll just created; it must not leak into
		// the next one. (It is never persisted to the defaults either.)
		setSettings((s) => ({ ...s, title: undefined }));
	}

	function handleJoin() {
		onJoin(code.trim().toUpperCase(), name.trim(), false);
	}

	return (
		<div className="flex min-h-svh flex-col items-center justify-center px-5 py-14">
			{/* Hero */}
			<div className="mb-10 flex flex-col items-center gap-4 text-center">
				<img
					src={`${import.meta.env.BASE_URL}logo-maskable.svg`}
					alt="Movie Poll logo"
					className="h-16 w-16 rounded-2xl"
					style={{
						boxShadow: '0 0 32px -8px oklch(0.8 0.12 160 / 0.4)',
					}}
				/>

				<div>
					<h1
						className="text-4xl font-bold tracking-tight sm:text-5xl"
						style={{ letterSpacing: '-0.03em' }}
					>
						Movie Poll
					</h1>
					<p className="mt-1.5 text-sm text-muted-foreground">
						Ranked choice voting &middot; cloud-synced &middot; no account needed
					</p>
				</div>
			</div>

			{/* Greeting — click to set or edit your name */}
			<button
				className="mb-4 text-sm text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
				onClick={() => setNameEditOpen(true)}
			>
				{name.trim() ? (
					<>
						Hello,{' '}
						<span className="font-semibold" style={{ color: 'oklch(0.8 0.12 160)' }}>
							{name.trim()}
						</span>
					</>
				) : (
					'Hello there'
				)}
			</button>

			{/* Card */}
			<div className="glass-card w-full max-w-sm p-6 shadow-2xl">
				<div className="space-y-4">
					<Button
						className="w-full rounded-xl font-semibold glow-amber transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
						style={{ height: '2.625rem' }}
						onClick={handleCreate}
					>
						Create poll
					</Button>

					<div className="text-center">
						<button
							className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline underline-offset-2 cursor-pointer"
							onClick={() => setShowSettingsModal(true)}
						>
							{settingsModified(settings) && (
								<span
									className="inline-block h-1.5 w-1.5 rounded-full"
									style={{ background: 'oklch(0.8 0.12 160)' }}
									title="You've customized the default settings"
								/>
							)}
							Customize poll
						</button>
					</div>

					<div className="flex items-center gap-3">
						<span className="h-px flex-1" style={{ background: 'oklch(1 0 0 / 15%)' }} />
						<span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
							or
						</span>
						<span className="h-px flex-1" style={{ background: 'oklch(1 0 0 / 15%)' }} />
					</div>

					<div className="space-y-1.5">
						<label
							className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
							htmlFor="code"
						>
							Poll code
						</label>
						<input
							id="code"
							className="cinema-input font-mono uppercase"
							style={{ letterSpacing: '0.18em' }}
							placeholder="ABC123"
							value={code}
							onChange={(e) => setCode(e.target.value)}
							onKeyDown={(e) => e.key === 'Enter' && code.trim() && handleJoin()}
						/>
					</div>

					<Button
						variant={code.trim() ? undefined : 'outline'}
						className={`w-full rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${code.trim() ? 'font-semibold glow-amber' : 'border-foreground/50 font-medium text-foreground hover:bg-secondary hover:text-foreground'}`}
						style={{ height: '2.625rem' }}
						disabled={code.trim().length === 0}
						onClick={handleJoin}
					>
						Join poll
					</Button>
				</div>
			</div>

			<GoogleSignIn />

			{/* Existing polls on this device */}
			{knownPolls.length > 0 && (
				<div className="glass-card mt-6 w-full max-w-sm p-5 shadow-2xl">
					<p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
						Your polls
					</p>
					<ul className="space-y-2">
						{activePolls.map((poll) => (
							<li
								key={poll.code}
								className="flex items-center gap-3 rounded-xl px-3 py-2.5"
								style={{ background: 'oklch(1 0 0 / 0.04)', border: '1px solid oklch(1 0 0 / 0.07)' }}
							>
								<button
									className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer"
									onClick={() => onJoin(poll.code, name.trim(), false)}
								>
									<span className="font-mono text-sm font-semibold tracking-[0.18em]">
										{poll.code}
									</span>
									{poll.title && (
										<span className="min-w-0 flex-1 truncate text-sm font-medium">
											{poll.title}
										</span>
									)}
									<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
										{poll.phase === 'nominations' && 'Nominating'}
										{poll.phase === 'voting' && 'Voting'}
										{poll.phase === 'results' &&
											(poll.winnerTitles.length > 0
												? `Winner: ${poll.winnerTitles.join(' & ')}`
												: 'Closed')}
									</span>
								</button>
								<button
									className="flex-shrink-0 rounded-lg px-1.5 py-1 text-[11px] opacity-50 transition-opacity hover:opacity-90"
									onClick={() => setArchived(poll.code, true)}
									title="Archive poll"
									aria-label={`Archive poll ${poll.code}`}
								>
									Archive
								</button>
								{poll.phase === 'results' && (
									<button
										className="flex-shrink-0 rounded-lg p-1 text-xs opacity-40 transition-opacity hover:opacity-90"
										onClick={() => dismissPoll(poll.code)}
										title="Dismiss poll"
										aria-label={`Dismiss poll ${poll.code}`}
									>
										✕
									</button>
								)}
							</li>
						))}
					</ul>
					{activePolls.length === 0 && (
						<p className="text-xs text-muted-foreground">No active polls.</p>
					)}
					{archivedPolls.length > 0 && (
						<div className="mt-3 border-t pt-3" style={{ borderColor: 'oklch(1 0 0 / 0.08)' }}>
							<button
								className="flex w-full items-center justify-between text-xs text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
								onClick={() => setShowArchived((v) => !v)}
								aria-expanded={showArchived}
							>
								<span>Archived ({archivedPolls.length})</span>
								<span aria-hidden>{showArchived ? '▲' : '▼'}</span>
							</button>
							{showArchived && (
								<ul className="mt-2 space-y-2">
									{archivedPolls.map((poll) => (
										<li
											key={poll.code}
											className="flex items-center gap-3 rounded-xl px-3 py-2.5"
											style={{ background: 'oklch(1 0 0 / 0.03)', border: '1px solid oklch(1 0 0 / 0.06)' }}
										>
											<button
												className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer opacity-70"
												onClick={() => onJoin(poll.code, name.trim(), false)}
											>
												<span className="font-mono text-sm font-semibold tracking-[0.18em]">
													{poll.code}
												</span>
												{poll.title && (
													<span className="min-w-0 flex-1 truncate text-sm font-medium">
														{poll.title}
													</span>
												)}
											</button>
											<button
												className="flex-shrink-0 rounded-lg px-1.5 py-1 text-[11px] opacity-60 transition-opacity hover:opacity-100"
												onClick={() => setArchived(poll.code, false)}
												aria-label={`Unarchive poll ${poll.code}`}
											>
												Unarchive
											</button>
										</li>
									))}
								</ul>
							)}
						</div>
					)}
				</div>
			)}

			<SettingsModal
				isOpen={showSettingsModal}
				onClose={() => setShowSettingsModal(false)}
				settings={settings}
				onChange={updateSettings}
			/>

			{nameEditOpen && (
				<NameEditModal
					current={name}
					onSave={saveName}
					onCancel={() => setNameEditOpen(false)}
				/>
			)}

			{/* Film strip decoration */}
			<div className="mt-10 flex items-center gap-1.5 opacity-[0.12]">
				{Array.from({ length: 9 }).map((_, i) => (
					<span
						key={i}
						className="block h-3 w-2 rounded-[2px] bg-foreground"
					/>
				))}
			</div>
		</div>
	);
			}
