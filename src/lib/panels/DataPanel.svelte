<script lang="ts">
	import TranscriptStore from '../../stores/transcriptStore';
	import UserStore from '../../stores/userStore';
	import { toTitleCase } from '$lib/core/string-utils';
	import { CloudUpload, ClipboardPaste, FilePlus } from '@lucide/svelte';
	import { EXAMPLES, EXAMPLE_LABELS } from '$lib/ui/examples';

	interface Props {
		onOpenUpload?: () => void;
		onOpenPaste?: () => void;
		onCreateNew?: () => void;
		onLoadExample?: (exampleId: string) => void;
		selectedExample?: string;
	}

	let { onOpenUpload, onOpenPaste, onCreateNew, onLoadExample, selectedExample = '' }: Props = $props();

	// Default-open so the sample datasets are visible at a glance  -  they're
	// a primary onboarding affordance, not a buried option.
	let showExamples = $state(true);
	let showStats = $state(false);
	let hasTranscript = $derived($TranscriptStore.wordArray.length > 0);
	// Resolve the active example's label for the disclosure summary.
	// `selectedExample` is an id (e.g. 'example-1') shared with the
	// AppNavbar examples menu; fall back to empty if no example is active.
	let selectedExampleLabel = $derived(selectedExample ? (EXAMPLE_LABELS[selectedExample] ?? '') : '');
</script>

<div class="data-panel">
	<!-- Load transcript section  -  promoted from top nav. Upload / Paste /
	     New are the primary actions; examples live in a collapsible list
	     below so they don't dominate the panel. -->
	<section class="data-panel__section">
		<p class="data-panel__section-label">Load transcript</p>
		<div class="data-panel__load-grid">
			<button type="button" class="te-btn te-btn--primary data-panel__load-btn" data-data-panel-upload onclick={() => onOpenUpload?.()}>
				<CloudUpload size={18} />
				<span>Upload file</span>
			</button>
			<button type="button" class="te-btn data-panel__load-btn" onclick={() => onOpenPaste?.()}>
				<ClipboardPaste size={18} />
				<span>Paste text</span>
			</button>
			<button type="button" class="te-btn data-panel__load-btn" onclick={() => onCreateNew?.()}>
				<FilePlus size={18} />
				<span>New transcript</span>
			</button>
		</div>

		<button type="button" class="data-panel__disclosure" aria-expanded={showExamples} onclick={() => (showExamples = !showExamples)}>
			<span class="data-panel__disclosure-label">
				<span class="data-panel__section-label">Example</span>
				{#if selectedExampleLabel}
					<span class="data-panel__disclosure-sublabel">{selectedExampleLabel}</span>
				{/if}
			</span>
			<span aria-hidden="true">{showExamples ? '–' : '+'}</span>
		</button>

		{#if showExamples}
			<ul class="data-panel__examples">
				{#each EXAMPLES as item}
					{@const Icon = item.icon}
					<li>
						<button
							type="button"
							class="data-panel__example"
							class:data-panel__example--active={selectedExample === item.value}
							aria-current={selectedExample === item.value ? 'true' : undefined}
							onclick={() => onLoadExample?.(item.value)}
						>
							<Icon size={14} class="flex-shrink-0" />
							<span>{item.label}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if hasTranscript}
		<section class="data-panel__section">
			<button type="button" class="data-panel__disclosure" aria-expanded={showStats} onclick={() => (showStats = !showStats)}>
				<span>{showStats ? 'Hide transcript statistics' : 'Show transcript statistics'}</span>
				<span aria-hidden="true">{showStats ? '–' : '+'}</span>
			</button>

			{#if showStats}
				<div class="data-panel__stats">
					<div>
						<span class="data-panel__stat-label">Total Words:</span>
						<span>{$TranscriptStore.totalNumOfWords}</span>
					</div>
					<div>
						<span class="data-panel__stat-label">Total Turns:</span>
						<span>{$TranscriptStore.totalConversationTurns}</span>
					</div>
					{#if $TranscriptStore.timingMode === 'untimed'}
						<div>
							<span class="data-panel__stat-label">Total Word Count:</span>
							<span>{Math.round($TranscriptStore.totalTimeInSeconds)}</span>
						</div>
					{:else}
						<div>
							<span class="data-panel__stat-label">Total Time:</span>
							<span>{$TranscriptStore.totalTimeInSeconds.toFixed(2)}s</span>
						</div>
					{/if}
					<div>
						<span class="data-panel__stat-label">Largest Turn:</span>
						<span>{$TranscriptStore.largestTurnLength} words</span>
					</div>
					<div>
						<span class="data-panel__stat-label">Most Frequent Word:</span>
						<span>"{$TranscriptStore.mostFrequentWord}" ({$TranscriptStore.maxCountOfMostRepeatedWord})</span>
					</div>
				</div>
			{/if}
		</section>

		{#if showStats}
			<section class="data-panel__section">
				<p class="data-panel__section-label">Speakers</p>
				{#if $UserStore.length === 0}
					<p class="data-panel__empty">No speakers loaded.</p>
				{:else}
					{#each $UserStore as user}
						<details class="data-panel__speaker">
							<summary class="data-panel__speaker-summary">
								<span class="data-panel__swatch" style="background-color: {user.color};" aria-hidden="true"></span>
								<span class="data-panel__speaker-name" title={toTitleCase(user.name)}>{toTitleCase(user.name)}</span>
							</summary>
							<div class="data-panel__speaker-body">
								<p>
									<span class="data-panel__stat-label">Status:</span>
									<span class={user.enabled ? 'data-panel__status-on' : 'data-panel__status-off'}>
										{user.enabled ? 'Active' : 'Inactive'}
									</span>
								</p>
								<p>
									<span class="data-panel__stat-label">Color:</span>
									<span>{user.color}</span>
								</p>
								{#if $TranscriptStore.wordArray.length > 0}
									{@const userWords = $TranscriptStore.wordArray.filter((dp) => dp.speaker === user.name)}
									{@const userTurns = new Set(userWords.map((dp) => dp.turnNumber))}
									<p>
										<span class="data-panel__stat-label">Words:</span>
										<span>{userWords.length}</span>
									</p>
									<p>
										<span class="data-panel__stat-label">Turns:</span>
										<span>{userTurns.size}</span>
									</p>

									{#if userWords.length > 0}
										<p class="data-panel__sample-label">Recent samples:</p>
										<ul class="data-panel__samples">
											{#each userWords.slice(-3) as dataPoint}
												<li>
													<span class="data-panel__sample-word">"{dataPoint.word}"</span>
													{#if $TranscriptStore.timingMode !== 'untimed'}
														<span class="data-panel__sample-time">
															{dataPoint.startTime.toFixed(2)}s – {dataPoint.endTime.toFixed(2)}s
														</span>
													{/if}
												</li>
											{/each}
										</ul>
									{/if}
								{/if}
							</div>
						</details>
					{/each}
				{/if}
			</section>
		{/if}
	{:else}
		<p class="data-panel__empty">No transcript loaded yet. Use one of the actions above to get started.</p>
	{/if}
</div>

<style>
	.data-panel {
		display: flex;
		flex-direction: column;
		padding: var(--te-sp-3);
		gap: 14px;
		font: var(--te-font-body) / var(--te-leading) var(--te-font-stack);
		color: var(--te-fg);
	}

	.data-panel__section {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.data-panel__section-label {
		font-size: var(--te-font-label);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-weight: 600;
		color: var(--te-fg-muted);
		margin: 0;
	}

	.data-panel__load-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 6px;
	}

	.data-panel__load-btn {
		justify-content: flex-start;
		width: 100%;
		min-height: 40px;
		padding: var(--te-sp-2) var(--te-sp-3);
	}

	.data-panel__disclosure {
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 6px 10px;
		margin-top: 4px;
		background: transparent;
		border: 1px dashed var(--te-border-muted);
		border-radius: var(--te-radius);
		color: var(--te-fg-muted);
		font: inherit;
		font-size: var(--te-font-small);
		cursor: pointer;
	}

	.data-panel__disclosure-label {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1px;
		text-align: left;
	}

	.data-panel__disclosure-sublabel {
		color: var(--te-fg-muted);
		font-size: 11px;
	}

	.data-panel__disclosure:hover {
		background: var(--te-bg-muted);
		color: var(--te-fg);
	}

	.data-panel__disclosure:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: 1px;
	}

	.data-panel__examples {
		list-style: none;
		margin: 4px 0 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.data-panel__example {
		display: inline-flex;
		align-items: center;
		gap: var(--te-sp-2);
		width: 100%;
		padding: 6px 10px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--te-radius-sm);
		color: var(--te-fg);
		font: inherit;
		font-size: var(--te-font-small);
		text-align: left;
		cursor: pointer;
	}

	.data-panel__example:hover {
		background: var(--te-bg-muted);
	}

	.data-panel__example:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: 1px;
	}

	.data-panel__example--active {
		background: var(--te-accent-tint);
		color: var(--te-fg);
	}

	.data-panel__stats {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: var(--te-sp-2) 10px;
		background: var(--te-bg-muted);
		border-radius: var(--te-radius);
	}

	.data-panel__stat-label {
		color: var(--te-fg-muted);
		margin-right: var(--te-sp-1);
	}

	.data-panel__empty {
		color: var(--te-fg-muted);
		font-size: var(--te-font-small);
		margin: 0;
	}

	.data-panel__speaker {
		border: 1px solid var(--te-border-muted);
		border-radius: var(--te-radius);
		overflow: hidden;
	}

	.data-panel__speaker-summary {
		display: flex;
		align-items: center;
		gap: var(--te-sp-2);
		padding: 6px 10px;
		background: var(--te-bg-muted);
		cursor: pointer;
		list-style: none;
		min-width: 0;
	}

	.data-panel__speaker-summary::-webkit-details-marker {
		display: none;
	}

	.data-panel__swatch {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 1px solid var(--te-border);
		flex: 0 0 auto;
	}

	.data-panel__speaker-name {
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
		flex: 1 1 auto;
	}

	.data-panel__speaker-body {
		padding: var(--te-sp-2) 10px;
		display: flex;
		flex-direction: column;
		gap: 3px;
		font-size: var(--te-font-small);
	}

	.data-panel__speaker-body p {
		margin: 0;
	}

	.data-panel__status-on {
		color: #059669;
	}

	.data-panel__status-off {
		color: var(--te-danger);
	}

	.data-panel__sample-label {
		margin-top: 6px !important;
		color: var(--te-fg-muted);
	}

	.data-panel__samples {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--te-sp-1);
	}

	.data-panel__samples li {
		padding: var(--te-sp-1) 6px;
		background: var(--te-bg);
		border: 1px solid var(--te-border-muted);
		border-radius: var(--te-radius-sm);
	}

	.data-panel__sample-word {
		display: block;
	}

	.data-panel__sample-time {
		display: block;
		color: var(--te-fg-muted);
		font-size: var(--te-font-small);
		margin-top: 2px;
	}
</style>
