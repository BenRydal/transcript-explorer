<script lang="ts">
	import { trapFocus } from '$lib/a11y/focus-trap';
	import { ShieldCheck, CloudUpload, ClipboardPaste, Mic, Lightbulb, CirclePlay, MessageSquare, Github, Video, Tags } from '@lucide/svelte';

	interface Props {
		open?: boolean;
		onLoadExample?: (id: string) => void;
		onOpenUpload?: () => void;
		onOpenPaste?: () => void;
		onStartTranscribe?: () => void;
		onStartTour?: () => void;
		onDismiss?: (dontShowAgain: boolean) => void;
	}

	/**
	 * Landing screen and primary entry point. Tabbed modal (role="dialog" +
	 * focus trap + Escape + backdrop). Self-contained: examples catalog is
	 * inlined; all callbacks optional and guarded with `?.`.
	 */
	let { open = $bindable(false), onLoadExample, onOpenUpload, onOpenPaste, onStartTranscribe, onStartTour, onDismiss }: Props = $props();

	let dialogEl: HTMLDivElement | null = $state(null);
	let dontShowAgain = $state(true);

	const uid = Math.random().toString(36).slice(2, 8);
	const titleId = `welcome-screen-title-${uid}`;
	const descId = `welcome-screen-desc-${uid}`;
	const checkboxId = `welcome-screen-hide-${uid}`;

	// Tabbed navigation. Splitting the content into a few short panels keeps
	// the screen light: users land on "Get started" and only dig into the
	// import / how-it-works reference if they want it.
	const tabs = [
		{ id: 'start', label: 'Get started' },
		{ id: 'import', label: 'Import data' },
		{ id: 'how', label: 'How it works' }
	] as const;
	type TabId = (typeof tabs)[number]['id'];
	let activeTab = $state<TabId>('start');

	const tabId = (id: TabId) => `welcome-tab-${id}-${uid}`;
	const panelId = (id: TabId) => `welcome-panel-${id}-${uid}`;

	// Default back to the first tab each time the screen opens.
	$effect(() => {
		if (open) activeTab = 'start';
	});

	function onTabKey(e: KeyboardEvent, index: number) {
		let next = index;
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % tabs.length;
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length;
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = tabs.length - 1;
		else return;
		e.preventDefault();
		activeTab = tabs[next].id;
		const el = dialogEl?.querySelector<HTMLButtonElement>(`#${tabId(tabs[next].id)}`);
		el?.focus();
	}

	const examples = [
		{
			id: 'example-1',
			title: 'Kindergarten Activity',
			description: 'A teacher and students explore how matter occupies space.',
			speakers: 9,
			duration: '2 min',
			thumb: '/images/thumbs/example-1.webp'
		},
		{
			id: 'example-3',
			title: '3rd Grade Classroom Discussion',
			description: 'Students debate whether 6 is odd or even.',
			speakers: 5,
			duration: '5 min',
			thumb: '/images/thumbs/example-2.webp'
		},
		{
			id: 'example-2',
			title: 'Museum Gallery Visit',
			description: 'A family visits an early country / bluegrass gallery.',
			speakers: 5,
			duration: '8 min',
			thumb: '/images/thumbs/example-3.webp'
		},
		{
			id: 'example-5',
			title: '2020 Presidential Debate',
			description: 'The 2020 presidential debate between Biden and Trump.',
			speakers: 3,
			duration: '90 min',
			thumb: '/images/thumbs/example-5.webp'
		}
	];

	$effect(() => {
		if (!open || !dialogEl) return;
		return trapFocus(dialogEl);
	});

	function loadExample(id: string) {
		onLoadExample?.(id);
		open = false;
	}

	function startTour() {
		onStartTour?.();
		open = false;
	}

	function dismiss() {
		onDismiss?.(dontShowAgain);
		open = false;
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			dismiss();
		}
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal modal-open" onkeydown={handleKey}>
		<div bind:this={dialogEl} class="modal-box welcome-screen" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId}>
			<!-- Compact header + tab strip -->
			<div class="welcome-screen__top">
				<h1 id={titleId} class="welcome-screen__title">Welcome to Transcript Explorer</h1>
				<p id={descId} class="welcome-screen__pitch">
					Turn conversation transcripts into interactive visualizations across speakers, time, and qualitative codes. Everything runs in your browser.
				</p>
				<div class="welcome-screen__tabs" role="tablist" aria-label="Welcome sections">
					{#each tabs as tab, i}
						<button
							type="button"
							role="tab"
							id={tabId(tab.id)}
							class="welcome-screen__tab"
							class:welcome-screen__tab--active={activeTab === tab.id}
							aria-selected={activeTab === tab.id}
							aria-controls={panelId(tab.id)}
							tabindex={activeTab === tab.id ? 0 : -1}
							onclick={() => (activeTab = tab.id)}
							onkeydown={(e) => onTabKey(e, i)}
						>
							{tab.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Tab panels (only the active one renders) -->
			<div class="welcome-screen__body">
				{#if activeTab === 'start'}
					<div role="tabpanel" id={panelId('start')} aria-labelledby={tabId('start')} tabindex="0" class="welcome-screen__panel">
						<section class="welcome-screen__section">
							<p class="welcome-screen__section-label">Try a sample dataset</p>
							<p class="welcome-screen__section-hint">Load a ready-made transcript and start exploring immediately.</p>
							<div class="welcome-screen__examples">
								{#each examples as example}
									<button type="button" class="welcome-screen__example" onclick={() => loadExample(example.id)}>
										<img src={example.thumb} alt={example.title} class="welcome-screen__example-thumb" />
										<div class="welcome-screen__example-body">
											<h3>{example.title}</h3>
											<p>{example.description}</p>
											<p class="welcome-screen__example-meta">
												<span>{example.speakers} speakers</span>
												<span>{example.duration}</span>
											</p>
										</div>
									</button>
								{/each}
							</div>
						</section>

						<section class="welcome-screen__section">
							<p class="welcome-screen__section-label">Or start your own</p>
							<div class="welcome-screen__row">
								<button
									type="button"
									class="te-btn te-btn--primary"
									onclick={() => {
										onOpenUpload?.();
										open = false;
									}}
								>
									<CloudUpload size={15} />
									<span>Upload a file</span>
								</button>
								<button
									type="button"
									class="te-btn"
									onclick={() => {
										onOpenPaste?.();
										open = false;
									}}
								>
									<ClipboardPaste size={15} />
									<span>Paste text</span>
								</button>
								<button
									type="button"
									class="te-btn"
									onclick={() => {
										onStartTranscribe?.();
										open = false;
									}}
								>
									<Mic size={15} />
									<span>Transcribe a video</span>
								</button>
							</div>
							<p class="welcome-screen__section-hint">New to importing? See the Import data tab for accepted formats.</p>
						</section>
					</div>
				{:else if activeTab === 'import'}
					<div role="tabpanel" id={panelId('import')} aria-labelledby={tabId('import')} tabindex="0" class="welcome-screen__panel">
						<section class="welcome-screen__section">
							<p class="welcome-screen__section-label">Transcript formats</p>
							<p class="welcome-screen__section-hint">Upload CSV, TXT, SRT, or VTT, or paste plain text. Open a format for an example.</p>

							<details class="welcome-screen__details" open>
								<summary>CSV</summary>
								<div class="welcome-screen__details-body">
									<p class="welcome-screen__mono">
										speaker, content, start, end<br />
										Teacher, "Good morning", 0, 3
									</p>
									<p class="welcome-screen__note">Times optional. Seconds, MM:SS, or HH:MM:SS.</p>
								</div>
							</details>

							<details class="welcome-screen__details">
								<summary>TXT</summary>
								<div class="welcome-screen__details-body">
									<p class="welcome-screen__mono">
										Teacher: Good morning<br />
										Student 1: Hi!
									</p>
									<p class="welcome-screen__note">Each line: Speaker, colon, content.</p>
								</div>
							</details>

							<details class="welcome-screen__details">
								<summary>SRT / VTT</summary>
								<div class="welcome-screen__details-body">
									<p class="welcome-screen__mono">
										1<br />
										00:00:01,000 --&gt; 00:00:03,500<br />
										Good morning class
									</p>
								</div>
							</details>

							<details class="welcome-screen__details">
								<summary>Paste</summary>
								<div class="welcome-screen__details-body">
									<p class="welcome-screen__mono">
										Alice: Hello there<br />
										Bob: Hi Alice!
									</p>
									<p class="welcome-screen__note">Auto-detects many common formats.</p>
								</div>
							</details>

							<div class="welcome-screen__hint-box">
								<Video size={16} />
								<div>
									<strong>Link with video:</strong> If your transcript has timestamps, upload an MP4 or paste a YouTube link to sync.
								</div>
							</div>
						</section>
					</div>
				{:else}
					<div role="tabpanel" id={panelId('how')} aria-labelledby={tabId('how')} tabindex="0" class="welcome-screen__panel">
						<section class="welcome-screen__section">
							<p class="welcome-screen__section-label">Workspaces</p>
							<ul class="welcome-screen__workspaces">
								<li><kbd>1</kbd> <strong>Edit</strong>: filters sidebar, editor and video on.</li>
								<li><kbd>2</kbd> <strong>Present</strong>: no sidebar, video only.</li>
								<li><kbd>3</kbd> <strong>Transcribe</strong>: focused capture workspace.</li>
							</ul>
						</section>

						<section class="welcome-screen__section">
							<p class="welcome-screen__section-label">Get oriented</p>
							<div class="welcome-screen__row">
								<button type="button" class="te-btn te-btn--primary" onclick={startTour}>
									<Lightbulb size={15} />
									<span>Take a quick tour</span>
								</button>
								<a class="te-btn" href="https://youtu.be/_2_3ilMm4pQ" target="_blank" rel="noopener noreferrer">
									<CirclePlay size={15} />
									<span>Watch demo video</span>
								</a>
							</div>
						</section>

						<section class="welcome-screen__section">
							<p class="welcome-screen__section-label">Qualitative codes</p>
							<details class="welcome-screen__details">
								<summary>Add qualitative codes via CSV</summary>
								<div class="welcome-screen__details-body welcome-screen__details-body--grid">
									<div class="welcome-screen__format">
										<h4>Turn + Code</h4>
										<p class="welcome-screen__mono">
											code, turn<br />
											math reasoning, 3
										</p>
									</div>
									<div class="welcome-screen__format">
										<h4>Turn Range + Code</h4>
										<p class="welcome-screen__mono">
											code, turn_start, turn_end<br />
											math reasoning, 3, 4
										</p>
									</div>
									<div class="welcome-screen__format">
										<h4>Time Range + Code</h4>
										<p class="welcome-screen__mono">
											code, start, end<br />
											math reasoning, 10.5, 18.2
										</p>
										<p class="welcome-screen__note">Requires a timed transcript.</p>
									</div>
									<div class="welcome-screen__format">
										<h4>Time Range Only</h4>
										<p class="welcome-screen__mono">
											start, end<br />
											10.5, 18.2
										</p>
										<p class="welcome-screen__note">The filename becomes the code name.</p>
									</div>
									<div class="welcome-screen__hint-box welcome-screen__hint-box--amber">
										<Tags size={16} />
										<div>
											<strong>Using codes:</strong> After loading, use the Filters panel to toggle codes, switch to code-based coloring, and hide uncoded
											data.
										</div>
									</div>
								</div>
							</details>
						</section>
					</div>
				{/if}
			</div>

			<!-- Persistent footer across all tabs -->
			<footer class="welcome-screen__footer">
				<div class="welcome-screen__footer-top">
					<div class="welcome-screen__privacy">
						<ShieldCheck size={14} />
						<span>Runs entirely in your browser</span>
					</div>
					<div class="welcome-screen__links">
						<a href="https://forms.gle/3i1F74V6cy5Q8RHv5" target="_blank" rel="noopener noreferrer">
							<MessageSquare size={13} />
							Feedback
						</a>
						<a href="https://github.com/BenRydal/transcript-explorer" target="_blank" rel="noopener noreferrer">
							<Github size={13} />
							Open Source
						</a>
						<a href="https://doi.org/10.1145/3706598.3713490" target="_blank" rel="noopener noreferrer"> Shapiro et al. (2025) </a>
					</div>
				</div>
				<div class="welcome-screen__footer-bottom">
					<label class="welcome-screen__checkbox" for={checkboxId}>
						<input id={checkboxId} type="checkbox" bind:checked={dontShowAgain} />
						<span>Don&rsquo;t show this again</span>
					</label>
					<button type="button" class="te-btn te-btn--ghost" onclick={dismiss}> Skip, explore on my own </button>
				</div>
			</footer>
		</div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="modal-backdrop" aria-hidden="true" onclick={dismiss}></div>
	</div>
{/if}

<style>
	.welcome-screen {
		width: min(64rem, 94vw);
		max-width: 64rem;
		max-height: 90vh;
		background: var(--te-bg);
		color: var(--te-fg);
		border: 1px solid var(--te-border-muted);
		border-radius: var(--te-radius-lg);
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.22);
		padding: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		font: var(--te-font-body) / var(--te-leading) var(--te-font-stack);
	}

	/* Fixed top region: compact header + tab strip */
	.welcome-screen__top {
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--te-sp-2);
		padding: var(--te-sp-4) var(--te-sp-5) 0;
	}

	.welcome-screen__title {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--te-fg);
	}

	.welcome-screen__pitch {
		margin: 0;
		max-width: 48rem;
		font-size: var(--te-font-small);
		line-height: var(--te-leading);
		color: var(--te-fg-muted);
	}

	/* Tab strip */
	.welcome-screen__tabs {
		display: flex;
		gap: var(--te-sp-1);
		margin-top: var(--te-sp-1);
		border-bottom: 1px solid var(--te-border-muted);
	}

	.welcome-screen__tab {
		appearance: none;
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		padding: var(--te-sp-2) var(--te-sp-3);
		font: inherit;
		font-size: var(--te-font-small);
		font-weight: 600;
		color: var(--te-fg-muted);
		cursor: pointer;
		transition:
			color 0.12s ease,
			border-color 0.12s ease;
	}

	.welcome-screen__tab:hover {
		color: var(--te-fg);
	}

	.welcome-screen__tab--active {
		color: var(--te-fg);
		border-bottom-color: var(--te-accent);
	}

	.welcome-screen__tab:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: -2px;
		border-radius: var(--te-radius-sm);
	}

	/* Scrollable middle region */
	.welcome-screen__body {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		padding: var(--te-sp-4) var(--te-sp-5);
	}

	.welcome-screen__panel {
		display: flex;
		flex-direction: column;
		gap: var(--te-sp-4);
	}

	.welcome-screen__panel:focus-visible {
		outline: none;
	}

	.welcome-screen__privacy {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		background: rgba(16, 185, 129, 0.1);
		color: #047857;
		border: 1px solid rgba(16, 185, 129, 0.3);
		border-radius: 999px;
		font-size: 11px;
	}

	/* Sections */
	.welcome-screen__section {
		display: flex;
		flex-direction: column;
		gap: var(--te-sp-2);
	}

	.welcome-screen__section-label {
		margin: 0;
		font-size: var(--te-font-label);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-weight: 600;
		color: var(--te-fg-muted);
	}

	.welcome-screen__section-hint {
		margin: -2px 0 var(--te-sp-1) 0;
		font-size: var(--te-font-small);
		color: var(--te-fg-muted);
	}

	.welcome-screen__row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--te-sp-2);
	}

	/* Example grid */
	.welcome-screen__examples {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
		gap: var(--te-sp-3);
	}

	.welcome-screen__example {
		display: flex;
		align-items: stretch;
		gap: 0;
		padding: 0;
		background: var(--te-bg);
		border: 1px solid var(--te-border-muted);
		border-radius: var(--te-radius);
		cursor: pointer;
		overflow: hidden;
		text-align: left;
		font: inherit;
		transition:
			border-color 0.12s ease,
			background 0.12s ease;
	}

	.welcome-screen__example:hover {
		border-color: #f59e0b;
		background: rgba(245, 158, 11, 0.05);
	}

	.welcome-screen__example:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: 1px;
	}

	.welcome-screen__example-thumb {
		width: 84px;
		height: 84px;
		object-fit: cover;
		flex: 0 0 auto;
	}

	.welcome-screen__example-body {
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: var(--te-sp-2) var(--te-sp-3);
		gap: 3px;
		min-width: 0;
	}

	.welcome-screen__example-body h3 {
		margin: 0;
		font-size: var(--te-font-body);
		font-weight: 600;
		color: var(--te-fg);
	}

	.welcome-screen__example-body p {
		margin: 0;
		font-size: var(--te-font-small);
		color: var(--te-fg-muted);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.welcome-screen__example-meta {
		display: flex;
		gap: var(--te-sp-2);
		color: var(--te-fg-muted) !important;
		font-size: var(--te-font-label) !important;
	}

	/* Collapsible reference */
	.welcome-screen__details {
		border: 1px solid var(--te-border-muted);
		border-radius: var(--te-radius);
		padding: var(--te-sp-2) var(--te-sp-3);
	}

	.welcome-screen__details summary {
		cursor: pointer;
		font-size: var(--te-font-small);
		font-weight: 600;
		color: var(--te-fg);
		list-style: revert;
	}

	.welcome-screen__details summary:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: 1px;
	}

	.welcome-screen__details-body {
		display: flex;
		flex-direction: column;
		gap: var(--te-sp-2);
		margin-top: var(--te-sp-2);
	}

	.welcome-screen__details-body--grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
	}

	.welcome-screen__details-body--grid .welcome-screen__hint-box {
		grid-column: 1 / -1;
	}

	.welcome-screen__format {
		padding: var(--te-sp-2) 10px;
		background: var(--te-bg-muted);
		border-radius: var(--te-radius);
	}

	.welcome-screen__format h4 {
		margin: 0 0 4px 0;
		font-size: var(--te-font-small);
		font-weight: 600;
		color: var(--te-fg);
	}

	.welcome-screen__mono {
		margin: 0;
		padding: var(--te-sp-1) 6px;
		background: var(--te-bg);
		border: 1px solid var(--te-border-muted);
		border-radius: var(--te-radius-sm);
		font-family: ui-monospace, Menlo, monospace;
		font-size: 11px;
		color: var(--te-fg);
		white-space: pre-wrap;
	}

	.welcome-screen__note {
		margin: 4px 0 0 0;
		font-size: var(--te-font-small);
		color: var(--te-fg-muted);
	}

	.welcome-screen__hint-box {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 8px 10px;
		background: rgba(59, 130, 246, 0.08);
		border: 1px solid rgba(59, 130, 246, 0.3);
		color: #1e40af;
		border-radius: 6px;
		font-size: 12px;
	}

	.welcome-screen__hint-box--amber {
		background: rgba(245, 158, 11, 0.08);
		border-color: rgba(245, 158, 11, 0.3);
		color: #92400e;
	}

	.welcome-screen__hint-box strong {
		color: inherit;
	}

	/* Workspace legend */
	.welcome-screen__workspaces {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--te-sp-4);
		font-size: var(--te-font-small);
		color: var(--te-fg-muted);
	}

	.welcome-screen__workspaces li {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.welcome-screen__workspaces kbd {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		padding: 1px 5px;
		border: 1px solid var(--te-border);
		border-bottom-width: 2px;
		border-radius: var(--te-radius-sm);
		background: var(--te-bg);
		color: var(--te-fg);
		font-family: ui-monospace, Menlo, monospace;
		font-size: var(--te-font-label);
		line-height: 1.2;
	}

	.welcome-screen__workspaces strong {
		color: var(--te-fg);
	}

	/* Persistent footer */
	.welcome-screen__footer {
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--te-sp-3);
		padding: var(--te-sp-3) var(--te-sp-5) var(--te-sp-4);
		border-top: 1px solid var(--te-border-muted);
		background: var(--te-bg);
	}

	.welcome-screen__footer-top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--te-sp-3);
	}

	.welcome-screen__links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--te-sp-4);
		font-size: 11px;
	}

	.welcome-screen__links a {
		display: inline-flex;
		align-items: center;
		gap: var(--te-sp-1);
		color: var(--te-fg-muted);
		text-decoration: none;
	}

	.welcome-screen__links a:hover {
		color: var(--te-fg);
	}

	.welcome-screen__footer-bottom {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--te-sp-3);
	}

	.welcome-screen__checkbox {
		display: inline-flex;
		align-items: center;
		gap: var(--te-sp-2);
		font-size: var(--te-font-small);
		color: var(--te-fg-muted);
		cursor: pointer;
	}

	.welcome-screen__checkbox input {
		width: 14px;
		height: 14px;
		cursor: pointer;
		accent-color: var(--te-accent);
	}

	.welcome-screen__checkbox:focus-within {
		color: var(--te-fg);
	}

	@media (max-width: 40rem) {
		.welcome-screen__top {
			padding: var(--te-sp-3) var(--te-sp-4) 0;
		}

		.welcome-screen__body {
			padding: var(--te-sp-4);
		}

		.welcome-screen__footer {
			padding: var(--te-sp-3) var(--te-sp-4) var(--te-sp-4);
		}

		.welcome-screen__title {
			font-size: 1.125rem;
		}

		.welcome-screen__tab {
			padding: var(--te-sp-2) var(--te-sp-2);
		}
	}
</style>
