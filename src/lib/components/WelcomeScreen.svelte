<script lang="ts">
	import { trapFocus } from '$lib/a11y/focus-trap';
	import {
		ShieldCheck,
		CloudUpload,
		ClipboardPaste,
		Mic,
		Lightbulb,
		CirclePlay,
		MessageSquare,
		Github,
		Video,
		Tags,
		ArrowRight,
		ChevronRight
	} from '@lucide/svelte';

	interface Props {
		open?: boolean;
		onLoadExample?: (id: string) => void;
		onOpenUpload?: () => void;
		onOpenPaste?: () => void;
		onStartTour?: () => void;
		onDismiss?: (dontShowAgain: boolean) => void;
	}

	/**
	 * Landing screen and primary entry point. Tabbed modal (role="dialog" +
	 * focus trap + Escape + backdrop). Self-contained: examples catalog is
	 * inlined; all callbacks optional and guarded with `?.`.
	 */
	let { open = $bindable(false), onLoadExample, onOpenUpload, onOpenPaste, onStartTour, onDismiss }: Props = $props();

	let dialogEl: HTMLDivElement | null = $state(null);
	let creditsEl: HTMLDetailsElement | null = $state(null);
	let dontShowAgain = $state(false);

	// Close the credits popover when the user clicks anywhere outside it.
	// The mousedown order means the native summary-toggle still works:
	// clicks on the summary itself are contained, so we don't pre-close it.
	$effect(() => {
		if (!creditsEl) return;
		function onDocMousedown(e: MouseEvent) {
			if (creditsEl?.open && !creditsEl.contains(e.target as Node)) {
				creditsEl.open = false;
			}
		}
		document.addEventListener('mousedown', onDocMousedown);
		return () => document.removeEventListener('mousedown', onDocMousedown);
	});

	const uid = Math.random().toString(36).slice(2, 8);
	const titleId = `welcome-screen-title-${uid}`;
	const descId = `welcome-screen-desc-${uid}`;
	const checkboxId = `welcome-screen-hide-${uid}`;

	const tabs = [
		{ id: 'start', label: 'Get started' },
		{ id: 'import', label: 'Import data' }
	] as const;
	type TabId = (typeof tabs)[number]['id'];
	let activeTab = $state<TabId>('start');

	const tabId = (id: TabId) => `welcome-tab-${id}-${uid}`;
	const panelId = (id: TabId) => `welcome-panel-${id}-${uid}`;

	// Reset to the first tab on the closed→open transition only. Tracking
	// the previous open state means unrelated reactive churn while open
	// stays true won't snap the user back to 'start' mid-interaction.
	let wasOpen = false;
	$effect(() => {
		if (open && !wasOpen) activeTab = 'start';
		wasOpen = open;
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
			description: 'A teacher and students explore how matter occupies space in a hands-on bilingual classroom activity',
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
			description: 'A family of five visits a museum gallery featuring early country and bluegrass artists',
			speakers: 5,
			duration: '8 min',
			thumb: '/images/thumbs/example-3.webp'
		},
		{
			id: 'example-5',
			title: '2020 Presidential Debate',
			description: 'The inaugural 2020 presidential debate between Joe Biden and Donald Trump',
			speakers: 3,
			duration: '90 min',
			thumb: '/images/thumbs/example-5.webp'
		}
	];

	// Accepted-format samples for the Import tab. Each line can be marked
	// `muted` to render with the secondary mono color (e.g. SRT/VTT line
	// numbers, paste-mode timestamp annotations).
	const formats: { label: string; lines: { text: string; muted?: boolean }[]; note?: string }[] = [
		{
			label: 'CSV',
			lines: [{ text: 'speaker, content, start, end' }, { text: 'Teacher, "Good morning", 0, 3' }, { text: 'Student, "Hi!", 3, 4' }],
			note: 'Times are optional — seconds, MM:SS, or HH:MM:SS.'
		},
		{
			label: 'TXT',
			lines: [{ text: 'Teacher: Good morning' }, { text: 'Student 1: Hi!' }, { text: "Teacher: Let's begin" }],
			note: 'Each line: Speaker, colon, then content.'
		},
		{
			label: 'SRT / VTT',
			lines: [
				{ text: '1', muted: true },
				{ text: '00:00:01,000 --> 00:00:03,500', muted: true },
				{ text: 'Good morning class' },
				{ text: '2', muted: true },
				{ text: '00:00:04,000 --> 00:00:05,000', muted: true },
				{ text: 'Hi teacher!' }
			]
		},
		{
			label: 'Paste text',
			lines: [
				{ text: 'Alice: Hello there' },
				{ text: 'Bob: Hi Alice!' },
				{ text: '— or with timestamps —', muted: true },
				{ text: '[0:01] Alice: Hello there' },
				{ text: '[0:03] Bob: Hi Alice!' }
			],
			note: 'Auto-detects many common formats.'
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

	function closeAndRun(fn?: () => void) {
		fn?.();
		open = false;
	}

	function goToImportTab() {
		activeTab = 'import';
		// Move keyboard focus to the new tab button so screen-readers and
		// keyboard users land in the right place after the panel swap.
		requestAnimationFrame(() => {
			const el = dialogEl?.querySelector<HTMLButtonElement>(`#${tabId('import')}`);
			el?.focus();
		});
	}

	function dismiss() {
		onDismiss?.(dontShowAgain);
		open = false;
	}

	// Only dismiss on a backdrop click if the gesture also STARTED on the
	// backdrop. Prevents accidental dismissal when the user drags a text
	// selection out of the modal-box and releases over the backdrop.
	let backdropMousedownOnBackdrop = false;

	function onBackdropMousedown(e: MouseEvent) {
		backdropMousedownOnBackdrop = e.target === e.currentTarget;
	}

	function onBackdropClick(e: MouseEvent) {
		if (backdropMousedownOnBackdrop && e.target === e.currentTarget) {
			dismiss();
		}
		backdropMousedownOnBackdrop = false;
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		e.preventDefault();
		// Close the credits popover first if it's open; otherwise dismiss the modal.
		if (creditsEl?.open) {
			creditsEl.open = false;
			return;
		}
		dismiss();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal modal-open" onkeydown={handleKey}>
		<div bind:this={dialogEl} class="modal-box welcome-screen" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId}>
			<!-- Header -->
			<div class="welcome-screen__top">
				<div class="welcome-screen__pitch-row">
					<h1 id={titleId} class="welcome-screen__title">Transcript Explorer</h1>
					<div class="welcome-screen__privacy" aria-label="Privacy">
						<ShieldCheck size={14} />
						<span>100% private — runs entirely in your browser</span>
					</div>
				</div>
				<p id={descId} class="welcome-screen__pitch">Visualize, explore, and create transcripts linked to video.</p>

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

			<!-- Tab content -->
			<div class="welcome-screen__body">
				{#if activeTab === 'start'}
					<div role="tabpanel" id={panelId('start')} aria-labelledby={tabId('start')} tabindex="0" class="welcome-screen__panel">
						<!-- Tour + Demo CTA cards -->
						<div class="welcome-screen__cta-row">
							<button type="button" class="welcome-screen__cta-card" onclick={() => closeAndRun(onStartTour)}>
								<span class="welcome-screen__cta-icon">
									<Lightbulb size={18} />
								</span>
								<span class="welcome-screen__cta-body">
									<span class="welcome-screen__cta-title">Take a guided tour</span>
									<span class="welcome-screen__cta-sub">Interactive walkthrough of the interface</span>
								</span>
							</button>
							<a class="welcome-screen__cta-card" href="https://youtu.be/_2_3ilMm4pQ" target="_blank" rel="noopener noreferrer">
								<span class="welcome-screen__cta-icon">
									<CirclePlay size={18} />
								</span>
								<span class="welcome-screen__cta-body">
									<span class="welcome-screen__cta-title">Watch demo video</span>
									<span class="welcome-screen__cta-sub">See the tool in action (3 min)</span>
								</span>
							</a>
						</div>

						<section class="welcome-screen__section">
							<h2 class="welcome-screen__examples-heading">Or dive in with an example</h2>
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

						<button type="button" class="welcome-screen__cta-card welcome-screen__cta-card--cross" onclick={goToImportTab}>
							<span class="welcome-screen__cta-icon">
								<CloudUpload size={18} />
							</span>
							<span class="welcome-screen__cta-body">
								<span class="welcome-screen__cta-title">Have your own data?</span>
								<span class="welcome-screen__cta-sub">See accepted formats and import a CSV, TXT, SRT, or video</span>
							</span>
							<span class="welcome-screen__cta-arrow" aria-hidden="true">
								<ArrowRight size={18} />
							</span>
						</button>

						<p class="welcome-screen__workspaces-inline">
							Switch workspaces with <kbd>1</kbd> Edit · <kbd>2</kbd> Present · <kbd>3</kbd> Transcribe
						</p>
					</div>
				{:else}
					<div role="tabpanel" id={panelId('import')} aria-labelledby={tabId('import')} tabindex="0" class="welcome-screen__panel">
						<div class="welcome-screen__row">
							<button type="button" class="te-btn te-btn--primary" onclick={() => closeAndRun(onOpenUpload)}>
								<CloudUpload size={15} />
								<span>Upload your transcript</span>
							</button>
							<button type="button" class="te-btn te-btn--primary" onclick={() => closeAndRun(onOpenPaste)}>
								<ClipboardPaste size={15} />
								<span>Paste text</span>
							</button>
							<button type="button" class="te-btn te-btn--primary" onclick={() => closeAndRun(onOpenUpload)}>
								<Video size={15} />
								<span>Upload Video</span>
							</button>
						</div>

						<p class="welcome-screen__section-label">Accepted formats</p>

						{#each formats as format}
							<details class="welcome-screen__details">
								<summary>
									<ChevronRight size={14} class="welcome-screen__details-arrow" /><span>{format.label}</span>
								</summary>
								<div class="welcome-screen__details-body">
									<div class="welcome-screen__mono">
										{#each format.lines as line}
											<div class={line.muted ? 'welcome-screen__mono-muted' : ''}>{line.text}</div>
										{/each}
									</div>
									{#if format.note}
										<p class="welcome-screen__note">{format.note}</p>
									{/if}
								</div>
							</details>
						{/each}

						<div class="welcome-screen__hint-box">
							<Video size={16} />
							<div>
								<strong>Link with video:</strong> If your transcript has timestamps, upload an MP4 or paste a YouTube link to sync visualizations with
								video playback.
							</div>
						</div>

						<div class="welcome-screen__hint-box">
							<Mic size={16} />
							<div>
								<strong>Auto-transcribe with AI:</strong> Upload an MP4 and click <em>Auto-Transcribe</em> in the upload modal. AI generates a transcript
								entirely in your browser. English only; all speech is assigned to one speaker, so use the editor to split speakers afterward.
							</div>
						</div>

						<details class="welcome-screen__details">
							<summary>
								<ChevronRight size={14} class="welcome-screen__details-arrow" />
								<Tags size={14} />
								<span>Add qualitative codes via CSV</span>
							</summary>
							<div class="welcome-screen__details-body welcome-screen__details-body--grid">
								<div class="welcome-screen__format">
									<h4>Turn + Code</h4>
									<div class="welcome-screen__mono">
										<div>code, turn</div>
										<div>math reasoning, 3</div>
									</div>
								</div>
								<div class="welcome-screen__format">
									<h4>Turn Range + Code</h4>
									<div class="welcome-screen__mono">
										<div>code, turn_start, turn_end</div>
										<div>math reasoning, 3, 4</div>
									</div>
								</div>
								<div class="welcome-screen__format">
									<h4>Time Range + Code</h4>
									<div class="welcome-screen__mono">
										<div>code, start, end</div>
										<div>math reasoning, 10.5, 18.2</div>
									</div>
									<p class="welcome-screen__note">Requires a timed transcript</p>
								</div>
								<div class="welcome-screen__format">
									<h4>Time Range Only</h4>
									<div class="welcome-screen__mono">
										<div>start, end</div>
										<div>10.5, 18.2</div>
									</div>
									<p class="welcome-screen__note">Filename becomes the code name</p>
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
					</div>
				{/if}
			</div>

			<!-- Persistent footer -->
			<footer class="welcome-screen__footer">
				<div class="welcome-screen__footer-top">
					<div class="welcome-screen__links">
						<details bind:this={creditsEl} class="welcome-screen__credits">
							<summary>Credits</summary>
							<div class="welcome-screen__credits-body">
								Example data from <em>Mathematics Teaching and Learning to Teach</em> (MTLT), University of Michigan (2010) and
								<em>The Third International Mathematics and Science Study</em>
								(TIMSS) 1999 Video Study. Speaker Garden inspired by
								<a href="https://doi.org/10.1145/320719.322581" target="_blank" rel="noopener noreferrer">PeopleGarden</a> by Xiong &amp; Donath. Word
								Rain inspired by work by
								<a href="https://doi.org/10.1177/14738716241236188" target="_blank" rel="noopener noreferrer">Skeppstedt, Ahltorp &amp; Lindström</a>.
							</div>
						</details>
						<a href="https://forms.gle/3i1F74V6cy5Q8RHv5" target="_blank" rel="noopener noreferrer">
							<MessageSquare size={13} />
							Feedback
						</a>
						<a href="https://github.com/BenRydal/transcript-explorer" target="_blank" rel="noopener noreferrer">
							<Github size={13} />
							Open Source
						</a>
						<a class="welcome-screen__citation" href="https://doi.org/10.1145/3706598.3713490" target="_blank" rel="noopener noreferrer"
							>Shapiro, Zhao et al. (2025)</a
						>
					</div>
				</div>
				<div class="welcome-screen__footer-bottom">
					<label class="welcome-screen__checkbox" for={checkboxId}>
						<input id={checkboxId} type="checkbox" bind:checked={dontShowAgain} />
						<span>Don&rsquo;t show this again</span>
					</label>
					<button type="button" class="te-btn te-btn--ghost" onclick={dismiss}>Dismiss</button>
				</div>
			</footer>
		</div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="modal-backdrop" aria-hidden="true" onmousedown={onBackdropMousedown} onclick={onBackdropClick}></div>
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

	/* Header */
	.welcome-screen__top {
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--te-sp-2);
		padding: var(--te-sp-4) var(--te-sp-5) 0;
	}

	.welcome-screen__pitch-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--te-sp-2);
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
		font-size: 0.9375rem;
		line-height: var(--te-leading);
		color: var(--te-fg-muted);
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
		white-space: nowrap;
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
		font-size: 0.95rem;
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

	/* Tour + Demo CTA cards (top of Get started) */
	.welcome-screen__cta-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--te-sp-3);
	}

	.welcome-screen__cta-card {
		appearance: none;
		display: flex;
		align-items: center;
		gap: var(--te-sp-3);
		padding: var(--te-sp-3);
		background: var(--te-bg);
		border: 1px solid var(--te-border-muted);
		border-radius: var(--te-radius);
		cursor: pointer;
		text-align: left;
		text-decoration: none;
		color: inherit;
		font: inherit;
		transition:
			border-color 0.12s ease,
			background 0.12s ease;
	}

	.welcome-screen__cta-card:hover {
		border-color: var(--te-accent);
		background: var(--te-bg-subtle);
	}

	.welcome-screen__cta-card:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: 1px;
	}

	.welcome-screen__cta-icon {
		flex: 0 0 auto;
		width: 36px;
		height: 36px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--te-bg-muted);
		color: var(--te-fg);
		border-radius: 999px;
	}

	.welcome-screen__cta-body {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.welcome-screen__cta-title {
		font-weight: 600;
		font-size: var(--te-font-body);
		color: var(--te-fg);
	}

	.welcome-screen__cta-sub {
		font-size: var(--te-font-small);
		color: var(--te-fg-muted);
	}

	/* Example grid */
	.welcome-screen__examples-heading {
		margin: 0 0 var(--te-sp-1) 0;
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--te-fg);
		letter-spacing: -0.01em;
	}

	.welcome-screen__examples {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
		gap: var(--te-sp-3);
	}

	.welcome-screen__example {
		position: relative;
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
		line-clamp: 2;
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

	.welcome-screen__row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--te-sp-2);
	}

	.welcome-screen__cta-card--cross {
		border-color: var(--te-accent);
		background: var(--te-bg-subtle);
	}

	.welcome-screen__cta-card--cross .welcome-screen__cta-icon {
		background: var(--te-accent);
		color: var(--te-bg);
	}

	.welcome-screen__cta-arrow {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--te-accent);
		transition: transform 0.15s ease;
	}

	.welcome-screen__cta-card--cross:hover .welcome-screen__cta-arrow {
		transform: translateX(3px);
	}

	/* Workspace legend (single line at bottom of Get started tab) */
	.welcome-screen__workspaces-inline {
		margin: var(--te-sp-2) 0 0 0;
		padding-top: var(--te-sp-2);
		border-top: 1px dashed var(--te-border-muted);
		font-size: var(--te-font-small);
		color: var(--te-fg-muted);
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}

	.welcome-screen__workspaces-inline kbd {
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

	.welcome-screen__mono {
		margin: 0;
		padding: var(--te-sp-2) 8px;
		background: var(--te-bg);
		border: 1px solid var(--te-border-muted);
		border-radius: var(--te-radius-sm);
		font-family: ui-monospace, Menlo, monospace;
		font-size: 11px;
		color: var(--te-fg);
		line-height: 1.5;
		white-space: pre-wrap;
	}

	.welcome-screen__mono-muted {
		color: var(--te-fg-muted);
	}

	.welcome-screen__note {
		margin: 0;
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

	/* Collapsible (codes) */
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
		list-style: none;
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.welcome-screen__details summary::-webkit-details-marker {
		display: none;
	}

	.welcome-screen__details summary:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: 1px;
	}

	:global(.welcome-screen__details-arrow) {
		flex-shrink: 0;
		color: var(--te-fg-muted);
		transition: transform 0.15s ease;
	}

	.welcome-screen__details[open] > summary :global(.welcome-screen__details-arrow) {
		transform: rotate(90deg);
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

	/* Footer */
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
		justify-content: flex-end;
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

	.welcome-screen__links a.welcome-screen__citation {
		color: var(--te-accent);
		font-weight: 600;
	}

	.welcome-screen__links a.welcome-screen__citation:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	/* Credits collapsible — popover above its summary so the footer stays compact */
	.welcome-screen__credits {
		position: relative;
		font-size: 11px;
		color: var(--te-fg-muted);
	}

	.welcome-screen__credits summary {
		cursor: pointer;
		list-style: none;
		color: var(--te-fg-muted);
	}

	.welcome-screen__credits summary::-webkit-details-marker {
		display: none;
	}

	.welcome-screen__credits summary:hover {
		color: var(--te-fg);
	}

	.welcome-screen__credits summary:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: 2px;
		border-radius: var(--te-radius-sm);
	}

	.welcome-screen__credits-body {
		position: absolute;
		left: 50%;
		bottom: calc(100% + 6px);
		transform: translateX(-50%);
		width: min(28rem, 90vw);
		padding: var(--te-sp-3);
		background: var(--te-bg);
		border: 1px solid var(--te-border-muted);
		border-radius: var(--te-radius);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
		font-size: var(--te-font-small);
		line-height: var(--te-leading);
		color: var(--te-fg-muted);
		z-index: 2;
	}

	.welcome-screen__credits-body a {
		color: var(--te-accent);
		text-decoration: none;
	}

	.welcome-screen__credits-body a:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
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

		.welcome-screen__pitch-row {
			align-items: flex-start;
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

		.welcome-screen__cta-row {
			grid-template-columns: 1fr;
		}
	}
</style>
