<script lang="ts">
	import {
		Lightbulb,
		CirclePlay,
		CloudUpload,
		Video,
		Mic,
		Pencil,
		MessageSquare,
		ShieldCheck,
		ClipboardPaste,
		Github,
		Sparkles,
		Tags
	} from '@lucide/svelte';

	interface Props {
		onLoadExample?: ((exampleId: string) => void) | null;
		onOpenUpload?: (() => void) | null;
		onOpenPaste?: (() => void) | null;
		onStartTour?: (() => void) | null;
		onShowWelcome?: (() => void) | null;
	}

	let {
		onLoadExample = null,
		onOpenUpload = null,
		onOpenPaste = null,
		onStartTour = null,
		onShowWelcome = null
	}: Props = $props();

	let activeTab: 'start' | 'import' | 'create' | 'codes' = $state('start');

	const tabs = [
		{ id: 'start', label: 'Get Started' },
		{ id: 'import', label: 'Import' },
		{ id: 'create', label: 'Create' },
		{ id: 'codes', label: 'Codes' }
	] as const;

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
</script>

<div class="help-panel">
	<div class="help-panel__privacy">
		<ShieldCheck size={14} />
		<span>Runs entirely in your browser</span>
	</div>

	<div class="help-panel__tabs" role="tablist" aria-label="Help sections">
		{#each tabs as tab}
			{@const selected = activeTab === tab.id}
			<button
				type="button"
				id={`help-tab-${tab.id}`}
				role="tab"
				aria-selected={selected}
				aria-controls={`help-tabpanel-${tab.id}`}
				tabindex={selected ? 0 : -1}
				class="help-panel__tab {selected ? 'help-panel__tab--active' : ''}"
				onclick={() => (activeTab = tab.id)}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	<div
		class="help-panel__tab-content"
		role="tabpanel"
		id={`help-tabpanel-${activeTab}`}
		aria-labelledby={`help-tab-${activeTab}`}
		tabindex="0"
	>
		{#if activeTab === 'start'}
			<div class="help-panel__stack">
				<button class="help-panel__action help-panel__action--amber" onclick={() => onStartTour?.()}>
					<Lightbulb size={16} />
					<span>Take a Guided Tour</span>
				</button>
				<a
					class="help-panel__action help-panel__action--blue"
					href="https://youtu.be/_2_3ilMm4pQ"
					target="_blank"
					rel="noopener noreferrer"
				>
					<CirclePlay size={16} />
					<span>Watch Demo Video</span>
				</a>
				{#if onShowWelcome}
					<button
						type="button"
						class="te-btn te-btn--ghost te-btn--sm help-panel__welcome-btn"
						onclick={() => onShowWelcome?.()}
					>
						<Sparkles size={14} />
						<span>Show welcome again</span>
					</button>
				{/if}
			</div>

			<p class="help-panel__section-label">Workspaces</p>
			<ul class="help-panel__workspaces">
				<li><kbd>1</kbd> <strong>Analyze</strong>: filters sidebar, editor + video on.</li>
				<li><kbd>2</kbd> <strong>Code</strong>: data sidebar, editor on, video off.</li>
				<li><kbd>3</kbd> <strong>Present</strong>: no sidebar, video only.</li>
			</ul>

			<p class="help-panel__section-label">Examples</p>
			<div class="help-panel__examples">
				{#each examples as example}
					<button class="help-panel__example" onclick={() => onLoadExample?.(example.id)}>
						<img src={example.thumb} alt={example.title} class="help-panel__example-thumb" />
						<div class="help-panel__example-body">
							<h3>{example.title}</h3>
							<p>{example.description}</p>
							<p class="help-panel__example-meta">
								<span>{example.speakers} speakers</span>
								<span>{example.duration}</span>
							</p>
						</div>
					</button>
				{/each}
			</div>
		{:else if activeTab === 'import'}
			<div class="help-panel__format">
				<h4>CSV</h4>
				<p class="help-panel__mono">
					speaker, content, start, end<br />
					Teacher, "Good morning", 0, 3
				</p>
				<p class="help-panel__note">Times optional: seconds, MM:SS, or HH:MM:SS.</p>
			</div>
			<div class="help-panel__format">
				<h4>TXT</h4>
				<p class="help-panel__mono">
					Teacher: Good morning<br />
					Student 1: Hi!
				</p>
				<p class="help-panel__note">Each line: Speaker, colon, content.</p>
			</div>
			<div class="help-panel__format">
				<h4>SRT / VTT</h4>
				<p class="help-panel__mono">
					1<br />
					00:00:01,000 --> 00:00:03,500<br />
					Good morning class
				</p>
			</div>
			<div class="help-panel__format">
				<h4>Paste</h4>
				<p class="help-panel__mono">
					Alice: Hello there<br />
					Bob: Hi Alice!
				</p>
				<p class="help-panel__note">Auto-detects many common formats.</p>
			</div>

			<div class="help-panel__hint-box">
				<Video size={16} />
				<div>
					<strong>Link with video:</strong> If your transcript has timestamps, upload an MP4 or paste a YouTube link to sync.
				</div>
			</div>

			<div class="help-panel__actions">
				<button class="help-panel__btn help-panel__btn--primary" onclick={() => onOpenUpload?.()}>
					<CloudUpload size={14} />
					Upload
				</button>
				<button class="help-panel__btn" onclick={() => onOpenPaste?.()}>
					<ClipboardPaste size={14} />
					Paste
				</button>
			</div>
		{:else if activeTab === 'create'}
			<p class="help-panel__intro">Have a video but no transcript? Generate or transcribe it.</p>

			<div class="help-panel__card">
				<div class="help-panel__card-header">
					<Mic size={18} />
					<strong>Auto-Transcribe with AI</strong>
				</div>
				<p>Upload MP4 → AI generates a transcript. Runs locally in-browser.</p>
				<p class="help-panel__note">English only. Assigns all speech to one speaker, reassign after.</p>
				<button class="help-panel__btn help-panel__btn--primary" onclick={() => onOpenUpload?.()}>
					<CloudUpload size={14} />
					Upload Video
				</button>
			</div>

			<div class="help-panel__card">
				<div class="help-panel__card-header">
					<Pencil size={18} />
					<strong>Transcribe Manually</strong>
				</div>
				<p>Upload video, then use Transcribe Mode, a focused workspace.</p>
				<p class="help-panel__note">Space to pause, arrows to skip, capture timestamps as you go.</p>
				<button class="help-panel__btn help-panel__btn--primary" onclick={() => onOpenUpload?.()}>
					<CloudUpload size={14} />
					Upload Video
				</button>
			</div>
		{:else if activeTab === 'codes'}
			<p class="help-panel__intro">Add qualitative codes via CSV.</p>

			<div class="help-panel__format">
				<h4>Turn + Code</h4>
				<p class="help-panel__mono">
					code, turn<br />
					math reasoning, 3
				</p>
			</div>
			<div class="help-panel__format">
				<h4>Turn Range + Code</h4>
				<p class="help-panel__mono">
					code, turn_start, turn_end<br />
					math reasoning, 3, 4
				</p>
			</div>
			<div class="help-panel__format">
				<h4>Time Range + Code</h4>
				<p class="help-panel__mono">
					code, start, end<br />
					math reasoning, 10.5, 18.2
				</p>
				<p class="help-panel__note">Requires a timed transcript.</p>
			</div>
			<div class="help-panel__format">
				<h4>Time Range Only</h4>
				<p class="help-panel__mono">
					start, end<br />
					10.5, 18.2
				</p>
				<p class="help-panel__note">The filename becomes the code name.</p>
			</div>

			<div class="help-panel__hint-box help-panel__hint-box--amber">
				<Tags size={16} />
				<div>
					<strong>Using codes:</strong> After loading, use the Filters panel to toggle codes,
					switch to code-based coloring, and hide uncoded data.
				</div>
			</div>

			<button class="help-panel__btn help-panel__btn--primary" onclick={() => onOpenUpload?.()}>
				<CloudUpload size={14} />
				Upload Code File
			</button>
		{/if}
	</div>

	<footer class="help-panel__footer">
		<a href="https://forms.gle/3i1F74V6cy5Q8RHv5" target="_blank" rel="noopener noreferrer">
			<MessageSquare size={13} />
			Feedback
		</a>
		<a href="https://github.com/BenRydal/transcript-explorer" target="_blank" rel="noopener noreferrer">
			<Github size={13} />
			Open Source
		</a>
		<a href="https://doi.org/10.1145/3706598.3713490" target="_blank" rel="noopener noreferrer">
			Shapiro et al. (2025)
		</a>
	</footer>
</div>

<style>
	.help-panel {
		display: flex;
		flex-direction: column;
		padding: var(--te-sp-3);
		gap: var(--te-sp-3);
		font: var(--te-font-body) / var(--te-leading) var(--te-font-stack);
		color: var(--te-fg);
	}

	.help-panel__privacy {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		background: rgba(16, 185, 129, 0.1);
		color: #047857;
		border: 1px solid rgba(16, 185, 129, 0.3);
		border-radius: 999px;
		font-size: 11px;
		align-self: flex-start;
	}

	.help-panel__tabs {
		display: flex;
		border-bottom: 1px solid var(--te-border-muted);
		gap: var(--te-sp-1);
	}

	.help-panel__tab {
		padding: 6px 8px;
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		font: inherit;
		font-size: var(--te-font-small);
		font-weight: 500;
		color: var(--te-fg-muted);
		cursor: pointer;
		margin-bottom: -1px;
	}

	.help-panel__tab:hover {
		color: var(--te-fg);
	}

	.help-panel__tab:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: 1px;
	}

	.help-panel__tab--active {
		color: var(--te-fg);
		border-bottom-color: var(--te-fg);
	}

	.help-panel__tab-content {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.help-panel__stack {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.help-panel__welcome-btn {
		align-self: flex-start;
	}

	.help-panel__action {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border: 1px solid transparent;
		border-radius: 8px;
		background: transparent;
		color: #111;
		font: inherit;
		font-weight: 500;
		cursor: pointer;
		text-decoration: none;
	}

	.help-panel__action--amber {
		background: linear-gradient(to right, #fef3c7, #fed7aa);
		border-color: #fde68a;
		color: #92400e;
	}

	.help-panel__action--amber:hover {
		border-color: #f59e0b;
	}

	.help-panel__action--blue {
		background: linear-gradient(to right, #dbeafe, #e0e7ff);
		border-color: #bfdbfe;
		color: #1d4ed8;
	}

	.help-panel__action--blue:hover {
		border-color: #3b82f6;
	}

	.help-panel__section-label {
		font-size: var(--te-font-label);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-weight: 600;
		color: var(--te-fg-muted);
		margin: 6px 0 0 0;
	}

	.help-panel__examples {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.help-panel__workspaces {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--te-sp-1);
		font-size: var(--te-font-small);
		color: var(--te-fg-muted);
	}

	.help-panel__workspaces li {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.help-panel__workspaces kbd {
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

	.help-panel__workspaces strong {
		color: var(--te-fg);
	}

	.help-panel__example {
		display: flex;
		align-items: stretch;
		gap: 0;
		padding: 0;
		background: transparent;
		border: 1px solid var(--te-border-muted);
		border-radius: var(--te-radius);
		cursor: pointer;
		overflow: hidden;
		text-align: left;
		font: inherit;
	}

	.help-panel__example:hover {
		border-color: #f59e0b;
		background: rgba(245, 158, 11, 0.05);
	}

	.help-panel__example-thumb {
		width: 64px;
		height: 64px;
		object-fit: cover;
		flex: 0 0 auto;
	}

	.help-panel__example-body {
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: 6px 8px;
		gap: 2px;
		min-width: 0;
	}

	.help-panel__example-body h3 {
		margin: 0;
		font-size: var(--te-font-small);
		font-weight: 600;
		color: var(--te-fg);
	}

	.help-panel__example-body p {
		margin: 0;
		font-size: var(--te-font-small);
		color: var(--te-fg-muted);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.help-panel__example-meta {
		display: flex;
		gap: var(--te-sp-2);
		color: var(--te-fg-muted) !important;
		font-size: var(--te-font-label) !important;
	}

	.help-panel__format {
		padding: var(--te-sp-2) 10px;
		background: var(--te-bg-muted);
		border-radius: var(--te-radius);
	}

	.help-panel__format h4 {
		margin: 0 0 4px 0;
		font-size: var(--te-font-small);
		font-weight: 600;
		color: var(--te-fg);
	}

	.help-panel__mono {
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

	.help-panel__note {
		margin: 4px 0 0 0;
		font-size: var(--te-font-small);
		color: var(--te-fg-muted);
	}

	.help-panel__hint-box {
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

	.help-panel__hint-box--amber {
		background: rgba(245, 158, 11, 0.08);
		border-color: rgba(245, 158, 11, 0.3);
		color: #92400e;
	}

	.help-panel__hint-box strong {
		color: inherit;
	}

	.help-panel__intro {
		margin: 0;
		color: var(--te-fg-muted);
	}

	.help-panel__card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px var(--te-sp-3);
		border: 1px solid var(--te-border-muted);
		border-radius: var(--te-radius);
	}

	.help-panel__card-header {
		display: inline-flex;
		align-items: center;
		gap: var(--te-sp-2);
		color: var(--te-fg);
		font-size: var(--te-font-body);
	}

	.help-panel__card p {
		margin: 0;
		font-size: var(--te-font-small);
		color: var(--te-fg-muted);
	}

	.help-panel__card .help-panel__btn {
		align-self: flex-start;
		margin-top: 4px;
	}

	.help-panel__actions {
		display: flex;
		gap: 6px;
	}

	.help-panel__btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		border: 1px solid var(--te-border);
		border-radius: var(--te-radius);
		background: var(--te-bg);
		color: var(--te-fg);
		font: inherit;
		font-size: var(--te-font-small);
		cursor: pointer;
	}

	.help-panel__btn:hover {
		background: var(--te-bg-muted);
	}

	.help-panel__btn:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: 1px;
	}

	.help-panel__btn--primary {
		background: var(--te-fg);
		color: var(--te-bg);
		border-color: var(--te-fg);
	}

	.help-panel__btn--primary:hover {
		background: color-mix(in srgb, var(--te-fg) 88%, black);
	}

	.help-panel__footer {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		padding-top: var(--te-sp-2);
		border-top: 1px solid var(--te-border-muted);
		font-size: 11px;
	}

	.help-panel__footer a {
		display: inline-flex;
		align-items: center;
		gap: var(--te-sp-1);
		color: var(--te-fg-muted);
		text-decoration: none;
	}

	.help-panel__footer a:hover {
		color: var(--te-fg);
	}
</style>
