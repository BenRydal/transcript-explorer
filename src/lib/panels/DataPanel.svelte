<script lang="ts">
	import TranscriptStore from '../../stores/transcriptStore';
	import UserStore from '../../stores/userStore';
	import { toTitleCase } from '$lib/core/string-utils';
	import { CloudUpload, ClipboardPaste, FilePlus, ChevronRight } from '@lucide/svelte';
	import { EXAMPLES } from '$lib/ui/examples';

	interface Props {
		onOpenUpload?: () => void;
		onOpenPaste?: () => void;
		onCreateNew?: () => void;
		onLoadExample?: (exampleId: string) => void;
		selectedExample?: string;
	}

	let { onOpenUpload, onOpenPaste, onCreateNew, onLoadExample, selectedExample = '' }: Props = $props();

	let showStats = $state(false);
	let hasTranscript = $derived($TranscriptStore.wordArray.length > 0);
</script>

<div class="data-panel">
	<!-- Load transcript section  -  promoted from top nav. Upload / Paste /
	     New are the primary actions. -->
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
	</section>

	<!-- Example datasets  -  promoted to a standalone, always-visible section
	     so first-time users notice they can explore sample data here (not just
	     from the welcome screen). Rendered as cards to stand out from the
	     outline load buttons above. -->
	<section class="data-panel__section">
		<p class="data-panel__section-label">Example datasets</p>
		<p class="data-panel__hint">Explore sample conversation data</p>
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
						<span class="data-panel__example-icon" aria-hidden="true"><Icon size={16} /></span>
						<span class="data-panel__example-label">{item.label}</span>
						<ChevronRight size={15} class="data-panel__example-arrow" aria-hidden="true" />
					</button>
				</li>
			{/each}
		</ul>
	</section>

	{#if hasTranscript}
		<details class="data-panel__section" bind:open={showStats}>
			<summary class="data-panel__summary">
				<ChevronRight size={14} class="data-panel__chevron" aria-hidden="true" />
				<span class="data-panel__section-label">Transcript statistics</span>
			</summary>

			<div class="data-panel__disclosure-body">
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
			</div>
		</details>

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

	.data-panel__hint {
		margin: 0;
		font-size: var(--te-font-small);
		color: var(--te-fg-muted);
	}

	/* Collapsible section header  -  matches the Filters/Settings panels
	   (native <details> + rotating chevron) for a consistent feel. */
	.data-panel__summary {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 2px;
		cursor: pointer;
		list-style: none;
		user-select: none;
		border-radius: var(--te-radius);
	}

	.data-panel__summary::-webkit-details-marker {
		display: none;
	}

	.data-panel__summary:hover {
		background: var(--te-bg-muted);
	}

	.data-panel__summary:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: 1px;
	}

	.data-panel__summary :global(.data-panel__chevron) {
		color: var(--te-fg-muted);
		flex: 0 0 auto;
		transition: transform 120ms ease;
	}

	details[open] > .data-panel__summary :global(.data-panel__chevron) {
		transform: rotate(90deg);
	}

	.data-panel__disclosure-body {
		padding-top: 6px;
	}

	.data-panel__examples {
		list-style: none;
		margin: 2px 0 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	/* Card-style example so the sample datasets read as primary, tappable
	   items rather than a thin list users skim past. */
	.data-panel__example {
		display: flex;
		align-items: center;
		gap: var(--te-sp-2);
		width: 100%;
		padding: 8px 10px;
		background: var(--te-bg);
		border: 1px solid var(--te-border);
		border-radius: var(--te-radius);
		color: var(--te-fg);
		font: inherit;
		font-size: var(--te-font-small);
		text-align: left;
		cursor: pointer;
		transition:
			border-color 100ms ease,
			background 100ms ease;
	}

	.data-panel__example-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		flex: 0 0 auto;
		border-radius: var(--te-radius);
		background: var(--te-accent-tint);
		color: var(--te-accent);
	}

	.data-panel__example-label {
		flex: 1 1 auto;
		min-width: 0;
		font-weight: 500;
	}

	.data-panel__example :global(.data-panel__example-arrow) {
		color: var(--te-fg-muted);
		flex: 0 0 auto;
		opacity: 0.6;
		transition: transform 100ms ease;
	}

	.data-panel__example:hover {
		background: var(--te-bg-muted);
		border-color: var(--te-accent);
	}

	.data-panel__example:hover :global(.data-panel__example-arrow) {
		transform: translateX(2px);
		opacity: 1;
	}

	.data-panel__example:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: 1px;
	}

	.data-panel__example--active {
		background: var(--te-accent-tint);
		border-color: var(--te-accent);
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
