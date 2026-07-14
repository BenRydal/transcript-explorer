<script lang="ts">
	import { Search, X, ChevronRight } from '@lucide/svelte';
	import { EntityToggleList, type Entity } from 'svelte-p5-components';
	import { get } from 'svelte/store';
	import UserStore from '../../stores/userStore';
	import FiltersStore from '../../stores/filtersStore';
	import CodeStore from '../../stores/codeStore';
	import TranscriptStore from '../../stores/transcriptStore';
	import P5Store from '../../stores/p5Store';
	import { clearAllCodes } from '$lib/core/code-utils';
	import { handleSpeakerToggle, handleSpeakerColorChange, handleSpeakerRename } from '$lib/speakers/speaker-handlers';

	let speakerEntities: Entity[] = $derived(
		$UserStore.map((u) => ({
			id: u.name,
			label: u.name,
			color: u.color,
			visible: u.enabled
		}))
	);

	const sortedCodes = $derived([...$CodeStore].sort((a, b) => a.code.localeCompare(b.code)));
	const allCodesEnabled = $derived($CodeStore.length > 0 && $CodeStore.every((c) => c.enabled));

	// Per-section "active" flags drive the badges in each section header and
	// feed the total count in the panel header.
	const hasWordSearch = $derived($FiltersStore.wordToSearch.length > 0);
	const hasHiddenSpeakers = $derived($UserStore.some((u) => !u.enabled));
	const hasDisabledCodes = $derived($CodeStore.length > 0 && $CodeStore.some((c) => !c.enabled));
	// "Show Uncoded" lives in the Codes section and only matters when codes
	// exist, so its off-state only counts as a filter alongside codes.
	const hasHiddenUncoded = $derived($CodeStore.length > 0 && !$FiltersStore.showUncoded);
	const hasCodeFilter = $derived(hasDisabledCodes || hasHiddenUncoded);
	const hasStopWords = $derived($FiltersStore.stopWordsEnabled);

	const activeFilterCount = $derived(
		(hasWordSearch ? 1 : 0) +
			(hasHiddenSpeakers ? 1 : 0) +
			(hasDisabledCodes ? 1 : 0) +
			(hasHiddenUncoded ? 1 : 0) +
			(hasStopWords ? 1 : 0)
	);

	function handleWordSearch(event: Event) {
		if (!(event.target instanceof HTMLInputElement)) return;
		FiltersStore.update((filters) => ({ ...filters, wordToSearch: event.target.value.trim() }));
	}

	function clearWordSearch() {
		FiltersStore.update((filters) => ({ ...filters, wordToSearch: '' }));
	}

	function handleToggleShowUncoded() {
		FiltersStore.update((filters) => ({ ...filters, showUncoded: !filters.showUncoded }));
		get(P5Store)?.loop?.();
	}

	function handleToggleCodeColorMode() {
		FiltersStore.update((filters) => ({ ...filters, codeColorMode: !filters.codeColorMode }));
		get(P5Store)?.loop?.();
	}

	function handleToggleAllCodes() {
		const newEnabled = !allCodesEnabled;
		CodeStore.update((codes) => codes.map((c) => ({ ...c, enabled: newEnabled })));
		get(P5Store)?.loop?.();
	}

	function handleCodeEnabledChange(code: string, enabled: boolean) {
		CodeStore.update((codes) => codes.map((c) => (c.code === code ? { ...c, enabled } : c)));
		get(P5Store)?.loop?.();
	}

	function handleCodeColorChange(code: string, color: string) {
		CodeStore.update((codes) => codes.map((c) => (c.code === code ? { ...c, color } : c)));
		get(P5Store)?.loop?.();
	}

	function handleClearCodes() {
		const transcript = $TranscriptStore;
		if (transcript?.wordArray) {
			clearAllCodes(transcript.wordArray);
			FiltersStore.update((f) => ({ ...f, codeColorMode: false, showUncoded: true }));
			get(P5Store)?.fillAllData?.();
		}
	}

	function handleToggleStopWords() {
		FiltersStore.update((filters) => ({
			...filters,
			stopWordsEnabled: !filters.stopWordsEnabled
		}));
	}

	// Custom stopwords: surface as comma- or newline-separated text; we parse
	// on blur so every keystroke doesn't trigger a cache clear + redraw.
	let customStopWordsDraft = $state($FiltersStore.customStopWords.join(', '));

	function commitCustomStopWords() {
		const parsed = customStopWordsDraft
			.split(/[\s,]+/)
			.map((w) => w.trim().toLowerCase())
			.filter((w) => w.length > 0);
		FiltersStore.update((filters) => ({ ...filters, customStopWords: parsed }));
	}

	function handleResetStopWords() {
		customStopWordsDraft = '';
		FiltersStore.update((filters) => ({ ...filters, customStopWords: [] }));
	}

	// Resets every content filter back to its default (show everything).
	// Leaves display-only options (Color by Codes) and the assigned codes
	// themselves untouched  -  this clears filters, it doesn't erase data.
	function handleClearAllFilters() {
		if (activeFilterCount === 0) return;
		UserStore.update((users) => users.map((u) => ({ ...u, enabled: true })));
		CodeStore.update((codes) => codes.map((c) => ({ ...c, enabled: true })));
		FiltersStore.update((filters) => ({
			...filters,
			wordToSearch: '',
			showUncoded: true,
			stopWordsEnabled: false,
			customStopWords: []
		}));
		customStopWordsDraft = '';
		get(P5Store)?.fillAllData?.();
	}
</script>

<div class="filters-panel">
	<!-- Panel header: active-filter summary + clear-all -->
	<div class="filters-panel__header">
		<span class="filters-panel__count">
			{#if activeFilterCount === 0}
				No active filters
			{:else}
				{activeFilterCount} active {activeFilterCount === 1 ? 'filter' : 'filters'}
			{/if}
		</span>
		<button
			type="button"
			class="filters-panel__clear-all"
			onclick={handleClearAllFilters}
			disabled={activeFilterCount === 0}
		>
			Clear all
		</button>
	</div>

	<!-- Word Search -->
	<details class="filters-panel__section" open>
		<summary class="filters-panel__summary">
			<ChevronRight size={14} class="filters-panel__chevron" aria-hidden="true" />
			<span class="filters-panel__section-label">Word Search</span>
			{#if hasWordSearch}<span class="filters-panel__badge" aria-hidden="true"></span>{/if}
		</summary>
		<div class="filters-panel__body">
			<div class="filters-panel__search">
				<Search size={14} class="filters-panel__search-icon" aria-hidden="true" />
				<input
					type="text"
					class="filters-panel__search-input"
					placeholder="Filter words..."
					aria-label="Filter words"
					value={$FiltersStore.wordToSearch}
					oninput={handleWordSearch}
				/>
				{#if hasWordSearch}
					<button type="button" class="filters-panel__search-clear" aria-label="Clear word search" onclick={clearWordSearch}>
						<X size={13} aria-hidden="true" />
					</button>
				{/if}
			</div>
		</div>
	</details>

	<!-- Speakers -->
	<details class="filters-panel__section" data-tour="speakers" open>
		<summary class="filters-panel__summary">
			<ChevronRight size={14} class="filters-panel__chevron" aria-hidden="true" />
			<span class="filters-panel__section-label">Speakers</span>
			{#if hasHiddenSpeakers}<span class="filters-panel__badge" aria-hidden="true"></span>{/if}
		</summary>
		<div class="filters-panel__body">
			{#if speakerEntities.length === 0}
				<p class="filters-panel__empty">No speakers loaded.</p>
			{:else}
				<EntityToggleList
					entities={speakerEntities}
					onToggle={handleSpeakerToggle}
					onColorChange={handleSpeakerColorChange}
					onRename={handleSpeakerRename}
				/>
			{/if}
		</div>
	</details>

	<!-- Codes -->
	{#if $CodeStore.length > 0}
		<details class="filters-panel__section" open>
			<summary class="filters-panel__summary">
				<ChevronRight size={14} class="filters-panel__chevron" aria-hidden="true" />
				<span class="filters-panel__section-label">Codes</span>
				{#if hasCodeFilter}<span class="filters-panel__badge" aria-hidden="true"></span>{/if}
			</summary>
			<div class="filters-panel__body">
				<label class="filters-panel__check-row">
					<input type="checkbox" role="switch" aria-checked={allCodesEnabled} checked={allCodesEnabled} onchange={handleToggleAllCodes} />
					<span>Enable All</span>
				</label>

				<label class="filters-panel__check-row">
					<input
						type="checkbox"
						role="switch"
						aria-checked={$FiltersStore.codeColorMode}
						checked={$FiltersStore.codeColorMode}
						onchange={handleToggleCodeColorMode}
					/>
					<span>Color by Codes</span>
				</label>

				<label class="filters-panel__check-row">
					<input
						type="checkbox"
						role="switch"
						aria-checked={$FiltersStore.showUncoded}
						checked={$FiltersStore.showUncoded}
						onchange={handleToggleShowUncoded}
					/>
					<span>Show Uncoded</span>
				</label>

				<div class="filters-panel__codes-list">
					{#each sortedCodes as code (code.code)}
						<div class="filters-panel__code-row">
							<input
								type="color"
								class="filters-panel__color-picker"
								aria-label={`Color for code ${code.code}`}
								value={code.color}
								onchange={(e) => handleCodeColorChange(code.code, (e.currentTarget as HTMLInputElement).value)}
							/>
							<label class="filters-panel__code-label" title={code.code}>
								<input
									type="checkbox"
									role="switch"
									aria-checked={code.enabled}
									checked={code.enabled}
									onchange={(e) => handleCodeEnabledChange(code.code, (e.currentTarget as HTMLInputElement).checked)}
								/>
								<span class="te-truncate">{code.code}</span>
							</label>
						</div>
					{/each}
				</div>

				<button class="filters-panel__clear-codes" onclick={handleClearCodes}>Clear All Codes</button>
			</div>
		</details>
	{/if}

	<!-- Stopwords -->
	<details class="filters-panel__section" open>
		<summary class="filters-panel__summary">
			<ChevronRight size={14} class="filters-panel__chevron" aria-hidden="true" />
			<span class="filters-panel__section-label">Stopwords</span>
			{#if hasStopWords}<span class="filters-panel__badge" aria-hidden="true"></span>{/if}
		</summary>
		<div class="filters-panel__body">
			<label class="filters-panel__check-row">
				<input
					type="checkbox"
					role="switch"
					aria-checked={$FiltersStore.stopWordsEnabled}
					checked={$FiltersStore.stopWordsEnabled}
					onchange={handleToggleStopWords}
				/>
				<span>Filter common words</span>
			</label>
			{#if $FiltersStore.stopWordsEnabled}
				<label class="filters-panel__stopwords-label" for="filters-stopwords-custom"> Additional words to filter (comma or newline separated) </label>
				<textarea
					id="filters-stopwords-custom"
					class="filters-panel__stopwords-input"
					rows="3"
					bind:value={customStopWordsDraft}
					onblur={commitCustomStopWords}
					placeholder="um, yeah, okay"
				></textarea>
				<button type="button" class="filters-panel__reset" onclick={handleResetStopWords}>Reset custom list</button>
			{/if}
		</div>
	</details>
</div>

<style>
	.filters-panel {
		display: flex;
		flex-direction: column;
		padding: var(--te-sp-3);
		gap: 10px;
		font: var(--te-font-body) / var(--te-leading) var(--te-font-stack);
		color: var(--te-fg);
	}

	/* Sticky summary/actions header. */
	.filters-panel__header {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--te-sp-2);
		padding: 2px 0 8px 0;
		margin: calc(-1 * var(--te-sp-3)) calc(-1 * var(--te-sp-3)) 0;
		padding-left: var(--te-sp-3);
		padding-right: var(--te-sp-3);
		padding-top: var(--te-sp-3);
		background: var(--te-bg);
		border-bottom: 1px solid var(--te-border);
	}

	.filters-panel__count {
		font-size: var(--te-font-small);
		color: var(--te-fg-muted);
	}

	.filters-panel__clear-all {
		padding: 4px 10px;
		border: 1px solid var(--te-border);
		border-radius: var(--te-radius);
		background: var(--te-bg);
		color: var(--te-fg);
		font: inherit;
		font-size: var(--te-font-small);
		cursor: pointer;
	}

	.filters-panel__clear-all:hover:not(:disabled) {
		background: var(--te-bg-muted);
	}

	.filters-panel__clear-all:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.filters-panel__section {
		display: flex;
		flex-direction: column;
	}

	/* Collapsible section header. */
	.filters-panel__summary {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 2px;
		cursor: pointer;
		list-style: none;
		user-select: none;
		border-radius: var(--te-radius);
	}

	.filters-panel__summary::-webkit-details-marker {
		display: none;
	}

	.filters-panel__summary:hover {
		background: var(--te-bg-muted);
	}

	.filters-panel__summary:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: 1px;
	}

	.filters-panel__summary :global(.filters-panel__chevron) {
		color: var(--te-fg-muted);
		flex: 0 0 auto;
		transition: transform 120ms ease;
	}

	.filters-panel__section[open] .filters-panel__summary :global(.filters-panel__chevron) {
		transform: rotate(90deg);
	}

	.filters-panel__section-label {
		font-size: var(--te-font-label);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-weight: 600;
		color: var(--te-fg-muted);
		margin: 0;
	}

	/* Small dot marking a section that has an active filter. */
	.filters-panel__badge {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--te-accent);
		flex: 0 0 auto;
	}

	.filters-panel__body {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 4px 2px 8px 22px;
	}

	.filters-panel__search {
		position: relative;
	}

	.filters-panel__search :global(.filters-panel__search-icon) {
		position: absolute;
		left: var(--te-sp-2);
		top: 50%;
		transform: translateY(-50%);
		color: var(--te-fg-muted);
		pointer-events: none;
	}

	.filters-panel__search-input {
		width: 100%;
		padding: 6px 30px 6px 28px;
		border: 1px solid var(--te-border);
		border-radius: var(--te-radius);
		background: var(--te-bg);
		font: inherit;
		color: var(--te-fg);
	}

	.filters-panel__search-input:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: 1px;
		border-color: var(--te-accent);
	}

	.filters-panel__search-clear {
		position: absolute;
		right: 6px;
		top: 50%;
		transform: translateY(-50%);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: transparent;
		color: var(--te-fg-muted);
		cursor: pointer;
	}

	.filters-panel__search-clear:hover {
		background: var(--te-bg-muted);
		color: var(--te-fg);
	}

	.filters-panel__empty {
		color: var(--te-fg-muted);
		font-size: var(--te-font-small);
		margin: 0;
	}

	.filters-panel__check-row {
		display: inline-flex;
		align-items: center;
		gap: var(--te-sp-2);
		cursor: pointer;
		padding: 3px 2px;
	}

	.filters-panel__check-row input[type='checkbox'] {
		width: 15px;
		height: 15px;
		cursor: pointer;
	}

	.filters-panel__codes-list {
		display: flex;
		flex-direction: column;
		gap: 3px;
		margin-top: var(--te-sp-1);
	}

	.filters-panel__code-row {
		display: flex;
		align-items: center;
		gap: var(--te-sp-2);
	}

	.filters-panel__code-label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
		flex: 1 1 auto;
		min-width: 0;
	}

	.filters-panel__code-label .te-truncate {
		flex: 1 1 auto;
	}

	.filters-panel__code-label input[type='checkbox'] {
		width: 14px;
		height: 14px;
	}

	.filters-panel__color-picker {
		width: 22px;
		height: 22px;
		border: none;
		border-radius: 50%;
		padding: 0;
		cursor: pointer;
		flex: 0 0 auto;
	}

	.filters-panel__clear-codes {
		margin-top: var(--te-sp-1);
		padding: 5px 8px;
		border: 1px solid color-mix(in srgb, var(--te-danger) 30%, transparent);
		border-radius: var(--te-radius);
		background: transparent;
		color: var(--te-danger);
		font: inherit;
		font-size: var(--te-font-small);
		cursor: pointer;
		align-self: flex-start;
	}

	.filters-panel__clear-codes:hover {
		background: color-mix(in srgb, var(--te-danger) 8%, transparent);
	}

	.filters-panel__reset {
		padding: 5px 8px;
		border: 1px solid var(--te-border);
		border-radius: var(--te-radius);
		background: var(--te-bg);
		color: var(--te-fg);
		font: inherit;
		font-size: var(--te-font-small);
		cursor: pointer;
		align-self: flex-start;
	}

	.filters-panel__reset:hover {
		background: var(--te-bg-muted);
	}

	.filters-panel__stopwords-label {
		display: block;
		margin-top: var(--te-sp-1);
		font-size: var(--te-font-small);
		color: var(--te-fg-muted);
	}

	.filters-panel__stopwords-input {
		width: 100%;
		padding: 6px 8px;
		border: 1px solid var(--te-border);
		border-radius: var(--te-radius);
		background: var(--te-bg);
		color: var(--te-fg);
		font: inherit;
		font-size: var(--te-font-small);
		resize: vertical;
		min-height: 60px;
	}

	.filters-panel__stopwords-input:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: 1px;
		border-color: var(--te-accent);
	}
</style>
