<script lang="ts">
	import { Check, LayoutDashboard } from '@lucide/svelte';
	import { PANEL_TILES } from '../ui/panel-icons';
	import VizStore, {
		type VizStoreType,
		type SpeakerSortOrder,
		type FingerprintOverlayMode,
		type FingerprintChartMode,
		type ContributionCloudWeighting
	} from '../../stores/vizStore';

	const techniqueToggleOptions = [
		'speakerGardenToggle',
		'turnChartToggle',
		'contributionCloudToggle',
		'turnNetworkToggle',
		'wordRainToggle',
		'speakerFingerprintToggle',
		'speakerHeatmapToggle',
		'turnLengthToggle',
		'questionFlowToggle',
		'wordJourneyToggle',
		'dashboardToggle'
	] as const;

	const PANEL_LABELS: Record<string, string> = {
		speakerGarden: 'Speaker Garden',
		turnChart: 'Turn Chart',
		contributionCloud: 'Contribution Cloud',
		turnNetwork: 'Turn Network',
		wordRain: 'Word Rain',
		speakerHeatmap: 'Speaker Heatmap',
		turnLength: 'Turn Length',
		speakerFingerprint: 'Speaker Fingerprint',
		questionFlow: 'Question Flow',
		wordJourney: 'Word Journey'
	};

	const vizCategories: { label: string; items: (keyof VizStoreType)[] }[] = [
		{ label: 'Speaker', items: ['speakerGardenToggle', 'speakerHeatmapToggle', 'speakerFingerprintToggle'] },
		{ label: 'Turn', items: ['turnChartToggle', 'turnNetworkToggle', 'turnLengthToggle', 'questionFlowToggle'] },
		{ label: 'Word', items: ['contributionCloudToggle', 'wordRainToggle', 'wordJourneyToggle'] }
	];

	const SPEAKER_SORT_OPTIONS: { order: SpeakerSortOrder; label: string }[] = [
		{ order: 'default', label: 'Appearance' },
		{ order: 'words', label: 'Word Count' },
		{ order: 'turns', label: 'Turn Count' },
		{ order: 'alpha', label: 'A–Z' }
	];

	type PanelToggle = { type: 'toggle'; key: keyof VizStoreType; label: string; hint?: string };
	type PanelSlider = {
		type: 'slider';
		key: keyof VizStoreType;
		label: string;
		min: number;
		max: number;
		formatValue?: (v: number) => string;
	};
	// Enum-style select rendered as a radio group. Used for the new
	// fingerprint/chart-mode and cloud-weighting selects, which are
	// multi-value (> 2) and don't map cleanly onto a toggle.
	type PanelSelect<K extends keyof VizStoreType = keyof VizStoreType> = {
		type: 'select';
		key: K;
		label: string;
		options: { value: VizStoreType[K]; label: string }[];
	};
	type PanelOption = PanelToggle | PanelSlider | PanelSelect | { type: 'speakerSort' };

	const formatBinCount = (v: number) => (v === 0 ? 'Auto' : String(v));

	const panelOptionsMap: Record<string, PanelOption[]> = {
		speakerGarden: [{ type: 'speakerSort' }],
		turnChart: [
			{ type: 'toggle', key: 'separateToggle', label: 'Group by Speaker' },
			{ type: 'toggle', key: 'silenceOverlapToggle', label: 'Silence Overlap' }
		],
		contributionCloud: [
			{
				type: 'select',
				key: 'contributionCloudWeighting',
				label: 'Weighting',
				options: [
					{ value: 'frequency', label: 'Frequency' },
					{ value: 'tfidf', label: 'TF-IDF (speaker-distinctive)' }
				]
			} as PanelSelect<'contributionCloudWeighting'>,
			{ type: 'toggle', key: 'separateToggle', label: 'Group by Speaker' },
			{ type: 'toggle', key: 'sortToggle', label: 'Sort by Frequency' },
			{ type: 'toggle', key: 'lastWordToggle', label: 'Emphasize Last Word' },
			{ type: 'toggle', key: 'echoWordsToggle', label: 'Echo Last Words' },
			{ type: 'toggle', key: 'repeatedWordsToggle', label: 'Only Repeated Words' },
			{ type: 'slider', key: 'repeatWordSliderValue', label: 'Minimum Repetitions', min: 2, max: 30 }
		],
		wordRain: [
			{ type: 'toggle', key: 'separateToggle', label: 'Group by Speaker' },
			{ type: 'toggle', key: 'wordRainTemporalBinning', label: 'Temporal Binning' },
			{ type: 'slider', key: 'wordRainMinFrequency', label: 'Min Frequency', min: 1, max: 10 },
			{ type: 'slider', key: 'wordRainBinCount', label: 'Bin Count', min: 4, max: 20 }
		],
		turnNetwork: [
			{ type: 'speakerSort' },
			{ type: 'toggle', key: 'turnNetworkHideSelfLoops', label: 'Hide Self-Loops' },
			{ type: 'toggle', key: 'turnNetworkWeightByWords', label: 'Weight by Words' },
			{
				type: 'toggle',
				key: 'turnNetworkStatisticalMode',
				label: 'Statistical (z-score)',
				hint: 'Show only transitions that deviate from chance (|z|≥1.96, p<0.05).'
			},
			{ type: 'slider', key: 'turnNetworkMinTransitions', label: 'Min Transitions', min: 1, max: 20 }
		],
		speakerHeatmap: [{ type: 'slider', key: 'heatmapBinCount', label: 'Bin Count', min: 0, max: 60, formatValue: formatBinCount }],
		turnLength: [{ type: 'slider', key: 'turnLengthBinCount', label: 'Bin Count', min: 0, max: 60, formatValue: formatBinCount }],
		speakerFingerprint: [
			{
				type: 'select',
				key: 'fingerprintChartMode',
				label: 'Chart',
				options: [
					{ value: 'radar', label: 'Radar' },
					{ value: 'parallel', label: 'Parallel coordinates' }
				]
			} as PanelSelect<'fingerprintChartMode'>,
			{
				type: 'select',
				key: 'fingerprintOverlayMode',
				label: 'Layout',
				options: [
					{ value: 'auto', label: 'Auto (small multiples when >3 speakers)' },
					{ value: 'overlay', label: 'Overlay' },
					{ value: 'small-multiples', label: 'Small multiples' }
				]
			} as PanelSelect<'fingerprintOverlayMode'>
		]
	};

	let activePanelKey = $derived(techniqueToggleOptions.find((t) => $VizStore[t])?.replace('Toggle', '') ?? '');
	let activeVisualizationName = $derived(activePanelKey ? (PANEL_LABELS[activePanelKey] ?? 'Dashboard') : 'None');

	let hiddenSliderKeys = $derived.by(() => {
		const hidden = new Set<keyof VizStoreType>();
		if (!$VizStore.wordRainTemporalBinning) hidden.add('wordRainBinCount');
		if (!$VizStore.repeatedWordsToggle) hidden.add('repeatWordSliderValue');
		return hidden;
	});

	let hasActiveSettings = $derived(!!activePanelKey && !!panelOptionsMap[activePanelKey]);

	function isOptionVisible(option: PanelOption): boolean {
		return option.type !== 'slider' || !hiddenSliderKeys.has(option.key);
	}

	function setSelect<K extends keyof VizStoreType>(key: K, value: VizStoreType[K]) {
		VizStore.update((store) => ({ ...store, [key]: value }));
	}

	function sliderLabel(option: PanelSlider): string {
		const value = $VizStore[option.key] as number;
		return `${option.label}: ${option.formatValue ? option.formatValue(value) : value}`;
	}

	function toggleSelection(selection: string, toggleOptions: readonly (keyof VizStoreType)[]) {
		VizStore.update((store) => {
			const updates: Record<string, boolean> = {};
			toggleOptions.forEach((key) => {
				updates[key] = key === selection ? !store[key] : false;
			});
			return { ...store, ...updates };
		});
	}

	function toggleSelectionOnly(selection: keyof VizStoreType) {
		VizStore.update((store) => ({ ...store, [selection]: !store[selection] }));
	}

	function setSpeakerSort(order: SpeakerSortOrder) {
		VizStore.update((store) => ({ ...store, speakerSortOrder: order }));
	}

	function updateSlider(key: keyof VizStoreType, event: Event) {
		if (!(event.target instanceof HTMLInputElement)) return;
		const value = parseFloat(event.target.value);
		if (isNaN(value)) return;
		VizStore.update((viz) => ({ ...viz, [key]: value }));
	}
</script>

<div class="viz-panel">
	<section class="viz-panel__section" aria-label="Visualizations">
		{#each vizCategories as category}
			{@const categoryLabelId = `viz-cat-${category.label.toLowerCase()}`}
			<p id={categoryLabelId} class="viz-panel__section-label">{category.label}</p>
			<div class="viz-panel__grid" role="group" aria-labelledby={categoryLabelId}>
				{#each category.items as toggle}
					{@const panelKey = toggle.replace('Toggle', '')}
					{@const isActive = $VizStore[toggle] === true}
					{@const tile = PANEL_TILES[panelKey]}
					<button
						type="button"
						class="viz-panel__tile {isActive ? 'viz-panel__tile--active' : ''}"
						aria-pressed={isActive}
						title={tile?.label ?? panelKey}
						onclick={() => toggleSelection(toggle, techniqueToggleOptions)}
					>
						{#if tile}
							<tile.icon size={18} strokeWidth={isActive ? 2.2 : 1.5} aria-hidden="true" />
						{/if}
						<span class="te-truncate">{tile?.label ?? panelKey}</span>
					</button>
				{/each}
			</div>
		{/each}

		<hr class="viz-panel__hr" />

		<div class="viz-panel__grid">
			<button
				type="button"
				class="viz-panel__tile {$VizStore.dashboardToggle ? 'viz-panel__tile--active' : ''}"
				aria-pressed={$VizStore.dashboardToggle}
				onclick={() => toggleSelection('dashboardToggle', techniqueToggleOptions)}
			>
				<LayoutDashboard size={18} strokeWidth={$VizStore.dashboardToggle ? 2.2 : 1.5} aria-hidden="true" />
				<span>Dashboard</span>
			</button>
		</div>
	</section>

	{#if hasActiveSettings}
		<section class="viz-panel__section viz-panel__section--settings">
			<p class="viz-panel__section-label">{activeVisualizationName} Settings</p>
			{#each panelOptionsMap[activePanelKey] as option}
				{#if isOptionVisible(option)}
					{#if option.type === 'toggle'}
						<button
							type="button"
							class="viz-panel__option"
							role="switch"
							aria-checked={$VizStore[option.key] as boolean}
							onclick={() => toggleSelectionOnly(option.key)}
							title={option.hint ?? ''}
						>
							<span class="viz-panel__check" aria-hidden="true">
								{#if $VizStore[option.key]}<Check size={14} />{/if}
							</span>
							<span>{option.label}</span>
						</button>
					{:else if option.type === 'select'}
						{@const labelId = `viz-select-${String(option.key)}`}
						<p id={labelId} class="viz-panel__sort-label">{option.label}</p>
						<div role="radiogroup" aria-labelledby={labelId} tabindex="-1">
							{#each option.options as opt}
								{@const checked = $VizStore[option.key] === opt.value}
								<button
									type="button"
									class="viz-panel__option"
									role="radio"
									aria-checked={checked}
									tabindex={checked ? 0 : -1}
									onclick={() => setSelect(option.key, opt.value)}
								>
									<span class="viz-panel__check" aria-hidden="true">
										{#if checked}<Check size={14} />{/if}
									</span>
									<span>{opt.label}</span>
								</button>
							{/each}
						</div>
					{:else if option.type === 'slider'}
						<label class="viz-panel__slider-label">
							<span>{sliderLabel(option)}</span>
							<input
								type="range"
								min={option.min}
								max={option.max}
								value={$VizStore[option.key]}
								class="viz-panel__slider"
								aria-label={option.label}
								oninput={(e) => updateSlider(option.key, e)}
							/>
						</label>
					{:else if option.type === 'speakerSort'}
						<p id="viz-sort-label" class="viz-panel__sort-label">Sort By</p>
						<div role="radiogroup" aria-labelledby="viz-sort-label" tabindex="-1">
							{#each SPEAKER_SORT_OPTIONS as sortOpt}
								{@const checked = $VizStore.speakerSortOrder === sortOpt.order}
								<button
									type="button"
									class="viz-panel__option"
									role="radio"
									aria-checked={checked}
									tabindex={checked ? 0 : -1}
									onclick={() => setSpeakerSort(sortOpt.order)}
								>
									<span class="viz-panel__check" aria-hidden="true">
										{#if checked}<Check size={14} />{/if}
									</span>
									<span>{sortOpt.label}</span>
								</button>
							{/each}
						</div>
					{/if}
				{/if}
			{/each}
		</section>
	{/if}
</div>

<style>
	.viz-panel {
		display: flex;
		flex-direction: column;
		padding: var(--te-sp-3);
		gap: var(--te-sp-3);
		font: var(--te-font-body) / var(--te-leading) var(--te-font-stack);
		color: var(--te-fg);
	}

	.viz-panel__section {
		display: flex;
		flex-direction: column;
	}

	.viz-panel__section--settings {
		padding-top: var(--te-sp-2);
		border-top: 1px solid var(--te-border-muted);
	}

	.viz-panel__section-label {
		font-size: var(--te-font-label);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-weight: 600;
		color: var(--te-fg-muted);
		margin: 0 0 6px 0;
	}

	.viz-panel__grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 6px;
	}

	.viz-panel__tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--te-sp-1);
		padding: var(--te-sp-2) var(--te-sp-1);
		min-height: 54px;
		border: 1px solid transparent;
		border-radius: var(--te-radius);
		background: transparent;
		color: var(--te-fg-muted);
		font-size: var(--te-font-small);
		cursor: pointer;
		transition:
			background 120ms ease,
			color 120ms ease,
			border-color 120ms ease;
	}

	.viz-panel__tile > .te-truncate {
		max-width: 100%;
	}

	@media (prefers-reduced-motion: reduce) {
		.viz-panel__tile {
			transition: none;
		}
	}

	.viz-panel__tile:hover {
		background: var(--te-bg-muted);
	}

	.viz-panel__tile:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: 1px;
	}

	.viz-panel__tile--active {
		background: var(--te-accent-tint);
		color: var(--te-accent);
		border-color: color-mix(in srgb, var(--te-accent) 30%, transparent);
		font-weight: 500;
	}

	.viz-panel__hr {
		margin: var(--te-sp-2) 0;
		border: none;
		border-top: 1px solid var(--te-border-muted);
	}

	.viz-panel__option {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: var(--te-sp-1) 2px;
		background: transparent;
		border: none;
		border-radius: var(--te-radius-sm);
		color: var(--te-fg);
		font: inherit;
		cursor: pointer;
		text-align: left;
	}

	.viz-panel__option:hover {
		background: var(--te-bg-muted);
	}

	.viz-panel__option:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: 1px;
	}

	.viz-panel__check {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		flex: 0 0 auto;
		color: var(--te-accent);
	}

	.viz-panel__slider-label {
		display: block;
		padding: var(--te-sp-1) 2px;
		color: var(--te-fg-muted);
		font-size: var(--te-font-small);
	}

	.viz-panel__slider {
		width: 100%;
		margin-top: var(--te-sp-1);
	}

	.viz-panel__sort-label {
		margin: var(--te-sp-1) 0;
		font-size: var(--te-font-small);
		color: var(--te-fg-muted);
	}
</style>
