<script lang="ts">
	import { Menu, X, Video, VideoOff, Upload, FileText, CircleCheck, Loader2, TriangleAlert } from '@lucide/svelte';
	import ThemeToggle from './ThemeToggle.svelte';
	import type { Workspace } from '../../stores/uiStateStore';
	import { WORKSPACE_LABELS, WORKSPACE_ORDER } from '$lib/ui/workspaces';
	import { EXAMPLES, EXAMPLE_LABELS } from '$lib/ui/examples';
	import VideoStore, { showVideo, hideVideo } from '../../stores/videoStore';
	import TranscriptStore from '../../stores/transcriptStore';
	import UserStore from '../../stores/userStore';
	import { autosaveStatus, type AutosaveStatus } from '../../stores/autosaveStore';
	import { recents } from '../../stores/recentsStore';
	import { saveStateImmediate } from '$lib/core/persistence';

	interface Props {
		isVideoLoaded?: boolean;
		activeWorkspace?: Workspace;
		selectedExampleId?: string;
		transcriptLabel?: string;
		onselectWorkspace?: (id: Workspace) => void;
		onopenDataPanel?: () => void;
		onloadExample?: (exampleId: string) => void;
		onloadRecent?: (entryId: string, kind: 'example' | 'upload') => void;
	}

	let {
		isVideoLoaded = false,
		activeWorkspace = 'visualize',
		selectedExampleId = '',
		transcriptLabel = '',
		onselectWorkspace,
		onopenDataPanel,
		onloadExample,
		onloadRecent
	}: Props = $props();

	let mobileMenuOpen = $state(false);

	/**
	 * Video visibility helpers  -  read the video store to drive the
	 * toggle's pressed state, and call the dedicated show/hide helpers
	 * so side-effects (stopPlayback on hide, etc.) stay consistent with
	 * workspaces.ts and elsewhere.
	 */
	let isVideoVisible = $derived($VideoStore.isVisible);
	function toggleVideoVisibility() {
		if (!isVideoLoaded) return;
		if (isVideoVisible) hideVideo();
		else showVideo();
	}

	function handleRecentSelect(id: string, kind: 'example' | 'upload') {
		if (kind === 'example') {
			onloadExample?.(id);
		} else {
			onloadRecent?.(id, kind);
		}
	}

	// Label of the currently active example (if any), surfaced in the
	// center transcript-name region so the user can see at a glance which
	// example is loaded.
	let selectedExampleLabel = $derived(selectedExampleId ? (EXAMPLE_LABELS[selectedExampleId] ?? '') : '');

	/**
	 * Radiogroup keyboard navigation for the workspace segmented control.
	 * APG radiogroup pattern: ArrowRight/ArrowDown → next; ArrowLeft/ArrowUp
	 * → previous; Home/End → first/last. Wraps. Activating the focused
	 * radio also selects it (single-select / single-tab-stop pattern).
	 */
	function handleWorkspaceKey(event: KeyboardEvent, group: HTMLElement) {
		const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
		if (!keys.includes(event.key)) return;
		event.preventDefault();
		const radios = Array.from(group.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
		if (radios.length === 0) return;
		const currentIdx = radios.findIndex((r) => r.getAttribute('aria-checked') === 'true');
		let nextIdx = currentIdx < 0 ? 0 : currentIdx;
		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				nextIdx = (currentIdx + 1 + radios.length) % radios.length;
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				nextIdx = (currentIdx - 1 + radios.length) % radios.length;
				break;
			case 'Home':
				nextIdx = 0;
				break;
			case 'End':
				nextIdx = radios.length - 1;
				break;
		}
		const id = WORKSPACE_ORDER[nextIdx];
		if (id) onselectWorkspace?.(id);
		radios[nextIdx]?.focus();
	}

	// ============================================================
	// Transcript stats region
	// ============================================================

	// `hasTranscript` drives visibility of the center region. Use
	// wordArray length (authoritative) rather than a separate loaded
	// flag; we only surface stats when there's actually data to count.
	let hasTranscript = $derived($TranscriptStore.wordArray.length > 0);

	let speakerCount = $derived($UserStore.length);
	let turnCount = $derived($TranscriptStore.totalConversationTurns);
	let wordCount = $derived($TranscriptStore.totalNumOfWords);
	let durationSeconds = $derived($TranscriptStore.totalTimeInSeconds);
	let isTimed = $derived($TranscriptStore.timingMode !== 'untimed');

	function formatDuration(seconds: number): string {
		if (!seconds || seconds <= 0) return '';
		const total = Math.round(seconds);
		const m = Math.floor(total / 60);
		const s = total % 60;
		if (m === 0) return `${s}s`;
		return `${m}m ${s.toString().padStart(2, '0')}s`;
	}

	let displayTranscriptName = $derived(transcriptLabel || selectedExampleLabel || 'Custom transcript');

	// ============================================================
	// Autosave indicator
	// ============================================================

	let autosave = $derived<AutosaveStatus>($autosaveStatus);

	function autosaveLabel(status: AutosaveStatus): string {
		switch (status) {
			case 'saving':
				return 'Saving…';
			case 'saved':
				return 'Saved';
			case 'error':
				return 'Autosave failed';
			default:
				return '';
		}
	}

	function retryAutosave() {
		if (autosave !== 'error') return;
		saveStateImmediate();
	}
</script>

<header class="navbar min-h-14 bg-base-100" aria-label="Primary">
	<div class="flex-none px-2">
		<span class="te-wordmark text-lg" style="color: var(--te-fg);"> Transcript Explorer </span>
	</div>

	<!-- Center region: transcript name + quick stats + autosave indicator.
	     Hidden entirely on narrow widths and when no transcript is loaded.
	     flex-1 makes it the elastic center between the logo and the right
	     cluster; min-w-0 enables the name's ellipsis truncation. -->
	{#if hasTranscript}
		<div class="hidden xl:flex flex-1 min-w-0 px-3 items-center gap-3 te-transcript-region" aria-label="Active transcript">
			<span class="te-truncate te-transcript-name" title={displayTranscriptName}>
				{displayTranscriptName}
			</span>
			<span class="te-transcript-stats" aria-label="Transcript statistics">
				<span>{speakerCount} speaker{speakerCount === 1 ? '' : 's'}</span>
				<span aria-hidden="true">·</span>
				<span>{turnCount} turn{turnCount === 1 ? '' : 's'}</span>
				<span aria-hidden="true">·</span>
				<span>{wordCount} word{wordCount === 1 ? '' : 's'}</span>
				{#if isTimed && durationSeconds > 0}
					<span aria-hidden="true">·</span>
					<span>{formatDuration(durationSeconds)}</span>
				{/if}
			</span>

			<!-- Autosave indicator. aria-live=polite so SR users hear
			     transitions; the visual presence flips based on status.
			     idle state renders nothing (presence is load-bearing  - 
			     a visible "idle" indicator would be noise). -->
			{#if autosave !== 'idle'}
				{#if autosave === 'error'}
					<button
						type="button"
						class="te-autosave te-autosave--error"
						role="status"
						aria-live="polite"
						title="Autosave failed. Click to retry."
						onclick={retryAutosave}
					>
						<TriangleAlert size={12} aria-hidden="true" />
						<span>{autosaveLabel(autosave)}</span>
					</button>
				{:else}
					<span class="te-autosave te-autosave--{autosave}" role="status" aria-live="polite">
						{#if autosave === 'saving'}
							<Loader2 size={12} class="te-autosave__spinner" aria-hidden="true" />
						{:else if autosave === 'saved'}
							<CircleCheck size={12} aria-hidden="true" />
						{/if}
						<span>{autosaveLabel(autosave)}</span>
					</span>
				{/if}
			{/if}
		</div>
	{:else}
		<div class="flex-1"></div>
	{/if}

	<!-- Mobile hamburger button -->
	<button
		class="te-btn te-btn--ghost te-btn--icon xl:hidden"
		onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
		aria-label="Toggle menu"
		aria-expanded={mobileMenuOpen}
		aria-controls="app-mobile-menu"
	>
		{#if mobileMenuOpen}
			<X size={24} />
		{:else}
			<Menu size={24} />
		{/if}
	</button>

	<!-- Desktop navigation -->
	<div class="hidden xl:flex flex-none px-2 items-center gap-2">
		<!-- Workspace Switcher (Edit / Visualize / Transcribe)  -  APG
		     radiogroup pattern: mutually exclusive choices with arrow-
		     key navigation. Each option is a role="radio" button and
		     aria-checked reflects selection. Only the checked option
		     is in the tab order (roving tabindex). Digits 1/2/3 are
		     handled globally in +page.svelte; surfaced here via <kbd>. -->
		<div class="te-btn-group" role="radiogroup" aria-label="Workspace" tabindex="-1" onkeydown={(e) => handleWorkspaceKey(e, e.currentTarget)}>
			{#each WORKSPACE_ORDER as id, idx}
				{@const checked = activeWorkspace === id}
				{@const digit = idx + 1}
				<button
					type="button"
					class="te-btn te-btn--sm te-ws-pill"
					role="radio"
					aria-checked={checked}
					tabindex={checked ? 0 : -1}
					title={`${WORKSPACE_LABELS[id]} workspace (press ${digit})`}
					onclick={() => onselectWorkspace?.(id)}
				>
					<span>{WORKSPACE_LABELS[id]}</span>
					<kbd class="te-kbd" aria-label={`Shortcut: press ${digit}`}>{digit}</kbd>
				</button>
			{/each}
		</div>

		<!-- Video visibility toggle. Quick hide/show for the floating
		     video panel; disabled until a video actually loads, since
		     showing an empty player is confusing. Editor toggle stays
		     workspace-owned and is NOT restored here. -->
		<button
			type="button"
			class="te-btn te-btn--sm te-btn--icon"
			onclick={toggleVideoVisibility}
			disabled={!isVideoLoaded}
			aria-pressed={isVideoVisible}
			aria-label={isVideoVisible ? 'Hide video' : 'Show video'}
			title={!isVideoLoaded ? 'Load a video to enable' : isVideoVisible ? 'Hide video' : 'Show video'}
		>
			{#if isVideoVisible}
				<Video size={16} aria-hidden="true" />
			{:else}
				<VideoOff size={16} aria-hidden="true" />
			{/if}
		</button>

		<!-- Theme toggle (cycles Light → Dark → System) -->
		<ThemeToggle variant="compact" />
	</div>
</header>

<!-- Mobile menu dropdown -->
{#if mobileMenuOpen}
	<div id="app-mobile-menu" class="mobile-menu xl:hidden">
		<div class="p-4 space-y-4">
			<!-- Mobile transcript stats row (mirrors the desktop center
			     region). Only shown when there's something to describe. -->
			{#if hasTranscript}
				<div class="mobile-menu__transcript">
					<p class="mobile-menu__transcript-name" title={displayTranscriptName}>
						{displayTranscriptName}
					</p>
					<p class="mobile-menu__transcript-stats">
						{speakerCount} speaker{speakerCount === 1 ? '' : 's'} ·
						{turnCount} turn{turnCount === 1 ? '' : 's'} ·
						{wordCount} word{wordCount === 1 ? '' : 's'}
						{#if isTimed && durationSeconds > 0}
							· {formatDuration(durationSeconds)}
						{/if}
					</p>
					{#if autosave !== 'idle'}
						<p class="mobile-menu__autosave mobile-menu__autosave--{autosave}" role="status" aria-live="polite">
							{autosaveLabel(autosave)}
						</p>
					{/if}
				</div>
			{/if}

			<!-- Workspace -->
			<div>
				<p class="mobile-menu__label" id="mobile-workspace-label">Workspace</p>
				<div
					class="te-btn-group w-full"
					role="radiogroup"
					aria-labelledby="mobile-workspace-label"
					tabindex="-1"
					onkeydown={(e) => handleWorkspaceKey(e, e.currentTarget)}
				>
					{#each WORKSPACE_ORDER as id, idx}
						{@const checked = activeWorkspace === id}
						<button
							type="button"
							class="te-btn te-btn--sm flex-1"
							role="radio"
							aria-checked={checked}
							tabindex={checked ? 0 : -1}
							title={`${WORKSPACE_LABELS[id]} (press ${idx + 1})`}
							onclick={() => {
								onselectWorkspace?.(id);
								mobileMenuOpen = false;
							}}
						>
							{WORKSPACE_LABELS[id]}
						</button>
					{/each}
				</div>
			</div>

			<!-- Quick Actions -->
			<div>
				<p class="mobile-menu__label">Actions</p>
				<div class="flex flex-wrap gap-2 items-center">
					<button
						type="button"
						class="te-btn te-btn--sm"
						onclick={() => {
							toggleVideoVisibility();
							mobileMenuOpen = false;
						}}
						disabled={!isVideoLoaded}
						aria-pressed={isVideoVisible}
						aria-label={isVideoVisible ? 'Hide video' : 'Show video'}
					>
						{#if isVideoVisible}
							<Video size={16} aria-hidden="true" />
						{:else}
							<VideoOff size={16} aria-hidden="true" />
						{/if}
						{isVideoVisible ? 'Hide video' : 'Show video'}
					</button>
					<button
						class="te-btn te-btn--sm te-btn--ghost"
						onclick={() => {
							onopenDataPanel?.();
							mobileMenuOpen = false;
						}}
					>
						<Upload size={16} aria-hidden="true" />
						Load transcript
					</button>
					<ThemeToggle variant="compact" />
				</div>
			</div>

			<!-- Recents (mobile) -->
			{#if $recents.length > 0}
				<div>
					<p class="mobile-menu__label" id="mobile-recents-label">Recents</p>
					<ul class="mobile-menu__examples" aria-labelledby="mobile-recents-label">
						{#each $recents as r}
							<li>
								<button
									type="button"
									class="mobile-menu__example"
									onclick={() => {
										handleRecentSelect(r.id, r.kind);
										mobileMenuOpen = false;
									}}
									title={r.label}
								>
									{#if r.kind === 'example'}
										<FileText size={14} aria-hidden="true" />
									{:else}
										<Upload size={14} aria-hidden="true" />
									{/if}
									<span class="te-truncate">{r.label}</span>
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Examples (mobile)  -  mirrors the desktop dropdown so the
			     quick-access list is reachable from both chrome forms. -->
			<div>
				<p class="mobile-menu__label" id="mobile-examples-label">Examples</p>
				<ul class="mobile-menu__examples" aria-labelledby="mobile-examples-label">
					{#each EXAMPLES as item}
						{@const Icon = item.icon}
						{@const isActive = selectedExampleId === item.value}
						<li>
							<button
								type="button"
								class="mobile-menu__example"
								class:mobile-menu__example--active={isActive}
								aria-current={isActive ? 'true' : undefined}
								onclick={() => {
									onloadExample?.(item.value);
									mobileMenuOpen = false;
								}}
							>
								<Icon size={14} aria-hidden="true" />
								<span>{item.label}</span>
							</button>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Logo wordmark only  -  Space Grotesk (self-hosted display font)
	   gives the brand some personality while body/UI text stays on the
	   system stack. Slightly tighter tracking than the old 0.04em since
	   Space Grotesk reads better a touch tighter at this size. */
	.te-wordmark {
		font-family: 'Space Grotesk', var(--te-font-stack);
		font-weight: 700;
		letter-spacing: 0.01em;
	}

	.mobile-menu {
		background: var(--te-bg);
		border-bottom: 1px solid var(--te-border-muted);
		box-shadow: 0 8px 16px rgba(0, 0, 0, 0.06);
	}

	.mobile-menu__label {
		font-size: var(--te-font-label);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-weight: 600;
		color: var(--te-fg-muted);
		margin: 0 0 var(--te-sp-2) 0;
	}

	/* Transcript region in the center of the nav. Shows name + stats +
	   autosave indicator. Hidden entirely when there's no transcript.
	   The flex min-width:0 + truncate combo lets the name ellipsize
	   without pushing the right cluster off-screen. */
	.te-transcript-region {
		color: var(--te-fg);
	}

	.te-transcript-name {
		font-size: var(--te-font-small);
		font-weight: 600;
		color: var(--te-fg);
		max-width: 260px;
	}

	.te-transcript-stats {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: var(--te-font-small);
		color: var(--te-fg-muted);
		white-space: nowrap;
	}

	/* Autosave indicator. Inline badge next to the transcript stats.
	   Three visible states (saving/saved/error); idle renders nothing. */
	.te-autosave {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: var(--te-font-small);
		color: var(--te-fg-muted);
		padding: 2px 6px;
		border-radius: var(--te-radius-sm);
		white-space: nowrap;
		background: transparent;
		border: 1px solid transparent;
	}

	.te-autosave--saved {
		color: var(--te-fg-muted);
	}

	.te-autosave--saving {
		color: var(--te-fg-muted);
	}

	.te-autosave--error {
		color: var(--te-danger);
		border-color: var(--te-border-muted);
		cursor: pointer;
		font: inherit;
	}

	.te-autosave--error:hover {
		background: var(--te-bg-muted);
	}

	.te-autosave--error:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: 1px;
	}

	/* Spin the Loader2 icon during 'saving'. Respects reduced-motion
	   via the global rule in app.css which clamps animation-duration. */
	:global(.te-autosave__spinner) {
		animation: te-spin 1s linear infinite;
	}

	@keyframes te-spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	/* Workspace pill + kbd hint. <kbd> renders the digit shortcut
	   visibly so users discover 1/2/3 without opening a help pane. */
	.te-ws-pill {
		gap: 6px;
	}

	.te-kbd {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		font-family: inherit;
		font-size: 10px;
		font-weight: 600;
		line-height: 1;
		color: var(--te-fg-muted);
		background: var(--te-bg-muted);
		border: 1px solid var(--te-border-muted);
		border-radius: var(--te-radius-sm);
	}

	/* When the pill is active (workspace selected), the kbd flips to
	   match the accent fg so it stays legible on the filled button. */
	.te-btn[aria-checked='true'] .te-kbd {
		color: var(--te-accent-fg);
		background: color-mix(in srgb, var(--te-accent-fg) 20%, transparent);
		border-color: color-mix(in srgb, var(--te-accent-fg) 30%, transparent);
	}

	/* Mobile transcript stats block (top of the mobile sheet). */
	.mobile-menu__transcript {
		padding: var(--te-sp-2) 0;
		border-bottom: 1px solid var(--te-border-muted);
	}

	.mobile-menu__transcript-name {
		margin: 0;
		font-size: var(--te-font-body);
		font-weight: 600;
		color: var(--te-fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mobile-menu__transcript-stats {
		margin: 2px 0 0;
		font-size: var(--te-font-small);
		color: var(--te-fg-muted);
	}

	.mobile-menu__autosave {
		margin: 4px 0 0;
		font-size: var(--te-font-small);
		color: var(--te-fg-muted);
	}

	.mobile-menu__autosave--error {
		color: var(--te-danger);
	}

	/* Mobile examples list  -  mirrors the desktop popover styling but
	   docked inside the mobile menu sheet. */
	.mobile-menu__examples {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.mobile-menu__example {
		display: inline-flex;
		align-items: center;
		gap: var(--te-sp-2);
		width: 100%;
		padding: 8px 10px;
		background: transparent;
		border: 1px solid var(--te-border-muted);
		border-radius: var(--te-radius-sm);
		color: var(--te-fg);
		font: inherit;
		font-size: var(--te-font-small);
		text-align: left;
		cursor: pointer;
	}

	.mobile-menu__example:hover {
		background: var(--te-bg-muted);
	}

	.mobile-menu__example:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: 1px;
	}

	.mobile-menu__example--active {
		background: var(--te-accent-tint);
		border-color: var(--te-accent);
	}
</style>
