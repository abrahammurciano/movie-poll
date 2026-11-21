import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, CircleHelp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CreatePollSettings } from '@/lib/pollSettings';
import { VOTING_METHODS } from '@/lib/voting';
import type { VotingMethod } from '@/types';

interface Props {
	isOpen: boolean;
	onClose: () => void;
	settings: CreatePollSettings;
	onChange: (settings: CreatePollSettings) => void;
}

const DEADLINE_OPTIONS: Array<{ minutes: number; label: string }> = [
	{ minutes: 60, label: '1 hour' },
	{ minutes: 720, label: '12 hours' },
	{ minutes: 1440, label: '1 day' },
	{ minutes: 4320, label: '3 days' },
	{ minutes: 10080, label: '1 week (default)' },
	{ minutes: 20160, label: '2 weeks' },
];

export function SettingsModal({ isOpen, onClose, settings, onChange }: Props) {
	const [methodHelp, setMethodHelp] = useState<VotingMethod | null>(null);
	const [methodsOpen, setMethodsOpen] = useState(false);
	// The number field keeps its own text so it can be empty while typing;
	// a valid number is committed immediately, and blur restores a valid one.
	const [nominationsText, setNominationsText] = useState(String(settings.maxNominationsPerUser));
	// Only close on a click that both started and ended on the backdrop, so a
	// native picker (select) dismissing over it can't close the dialog.
	const pressStartedOnBackdrop = useRef(false);

	useEffect(() => {
		if (isOpen) {
			setNominationsText(String(settings.maxNominationsPerUser));
			setMethodsOpen(false);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen]);

	if (!isOpen) return null;

	function handleMaxNominations(value: string) {
		const digits = value.replace(/\D/g, '').slice(0, 2);
		setNominationsText(digits);
		const parsed = parseInt(digits, 10);
		if (isNaN(parsed)) return;
		const clamped = Math.min(20, Math.max(1, parsed));
		onChange({ ...settings, maxNominationsPerUser: clamped });
	}

	function commitMaxNominations() {
		setNominationsText(String(settings.maxNominationsPerUser));
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-5 py-3 pointer-events-auto"
			onPointerDown={(e) => { pressStartedOnBackdrop.current = e.target === e.currentTarget; }}
			onClick={(e) => {
				if (e.target === e.currentTarget && pressStartedOnBackdrop.current) onClose();
				pressStartedOnBackdrop.current = false;
			}}
			role="dialog"
			aria-modal="true"
		>
			<div
				className="glass-card w-full max-w-sm max-h-[95dvh] overflow-y-auto overscroll-contain p-6 shadow-2xl pointer-events-auto"
				onClick={(e) => e.stopPropagation()}
			>
				<h2 className="mb-6 text-2xl font-bold tracking-tight">Poll Settings</h2>

				<div className="space-y-4">
					<div className="space-y-2">
						<label
							className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
							htmlFor="pollTitle"
						>
							Poll title (optional)
						</label>
						<input
							id="pollTitle"
							type="text"
							maxLength={100}
							className="cinema-input"
							placeholder="e.g. Friday Movie Night"
							value={settings.title ?? ''}
							onChange={(e) => onChange({ ...settings, title: e.target.value || undefined })}
						/>
						<p className="text-[11px] text-muted-foreground">
							Only you (the host) can set or change it, and you can do so later too.
						</p>
					</div>

					<div className="space-y-2">
						<label
							className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
							htmlFor="maxNominations"
						>
							Max nominations per user
						</label>
						<input
							id="maxNominations"
							type="text"
							inputMode="numeric"
							pattern="[0-9]*"
							className="cinema-input"
							value={nominationsText}
							onChange={(e) => handleMaxNominations(e.target.value)}
							onBlur={commitMaxNominations}
						/>
						<p className="text-[11px] text-muted-foreground">
							How many movies can each person nominate?
						</p>
					</div>

					<div className="space-y-2">
						<label
							className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
							htmlFor="deadline"
						>
							Voting deadline
						</label>
						<select
							id="deadline"
							className="cinema-input"
							value={settings.deadlineMinutes}
							onChange={(e) => onChange({ ...settings, deadlineMinutes: parseInt(e.target.value) })}
						>
							{DEADLINE_OPTIONS.map((option) => (
								<option key={option.minutes} value={option.minutes}>
									{option.label}
								</option>
							))}
						</select>
						<p className="text-[11px] text-muted-foreground">
							Voting closes automatically this long after the poll is created.
						</p>
					</div>

					<div className="space-y-2">
						<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
							Voting method
						</p>
						<ul className="space-y-2">
							{(Object.keys(VOTING_METHODS) as VotingMethod[])
								.filter((method) => methodsOpen || method === settings.votingMethod)
								.map((method) => {
								const meta = VOTING_METHODS[method];
								const selected = settings.votingMethod === method;
								return (
									<li key={method}>
										<div
											role="button"
											tabIndex={0}
											className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors"
											style={{
												background: selected ? 'oklch(0.8 0.12 160 / 0.12)' : 'oklch(1 0 0 / 0.04)',
												border: selected ? '1px solid oklch(0.8 0.12 160 / 0.45)' : '1px solid oklch(1 0 0 / 0.08)',
											}}
											onClick={() => { onChange({ ...settings, votingMethod: method }); setMethodsOpen(false); }}
											onKeyDown={(e) => { if (e.key === 'Enter') { onChange({ ...settings, votingMethod: method }); setMethodsOpen(false); } }}
										>
											<span
												className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full"
												style={{ border: '2px solid oklch(0.8 0.12 160)' }}
											>
												{selected && (
													<span
														className="h-2 w-2 rounded-full"
														style={{ background: 'oklch(0.8 0.12 160)' }}
													/>
												)}
											</span>
											<span className="min-w-0 flex-1">
												<span className="block text-sm font-medium">{meta.name}</span>
												<span className="block text-[11px] leading-snug text-muted-foreground">
													{meta.brief}
												</span>
											</span>
											<button
												className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors"
												style={{
													background: 'oklch(0.8 0.12 160 / 0.15)',
													color: 'oklch(0.8 0.12 160)',
												}}
												title={`How ${meta.name} works`}
												aria-label={`How ${meta.name} works`}
												onClick={(e) => { e.stopPropagation(); setMethodHelp(method); }}
											>
												<CircleHelp className="h-4 w-4" aria-hidden="true" />
											</button>
										</div>
									</li>
								);
							})}
						</ul>
						<button
							type="button"
							className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline cursor-pointer"
							aria-expanded={methodsOpen}
							onClick={() => setMethodsOpen((v) => !v)}
						>
							<span className="inline-flex items-center gap-1">
								{methodsOpen ? (
									<ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
								) : (
									<ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
								)}
								{methodsOpen ? 'Show less' : 'Change method'}
							</span>
						</button>
					</div>

					<p className="text-[11px] text-muted-foreground/70">
						Changes are saved automatically and become the defaults for your next polls.
					</p>

					<Button
						className="w-full rounded-xl font-semibold glow-amber"
						style={{ height: '2.625rem' }}
						onClick={onClose}
					>
						<Check className="h-4 w-4" aria-hidden="true" />
						Done
					</Button>
				</div>
			</div>

			{methodHelp && (
				<div
					className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-8"
					onClick={() => setMethodHelp(null)}
				>
					<div
						className="glass-card w-full max-w-xs p-5 shadow-2xl"
						onClick={(e) => e.stopPropagation()}
					>
						<h3 className="mb-2 text-base font-semibold">{VOTING_METHODS[methodHelp].name}</h3>
						<p className="text-sm leading-relaxed text-muted-foreground">
							{VOTING_METHODS[methodHelp].details}
						</p>
						<Button
							className="mt-4 w-full rounded-xl font-semibold"
							style={{ height: '2.25rem' }}
							onClick={() => setMethodHelp(null)}
						>
							Got it
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
