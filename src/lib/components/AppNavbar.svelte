<script lang="ts">
	import { CircleHelp, CloudUpload, FilePlus, Video, VideoOff, Check, Settings as SettingsIcon, Text, ChartBar, Menu, X, Keyboard, GraduationCap, Landmark, Mic, Search, Settings2 } from '@lucide/svelte';
	import IconButton from './IconButton.svelte';
	import ConfigStore, { type ConfigStoreType, type GardenSortOrder } from '../../stores/configStore';

	interface Props {
		selectedExample?: string;
		isEditorVisible?: boolean;
		isVideoVisible?: boolean;
		isVideoLoaded?: boolean;
		onloadExample?: (exampleId: string) => void;
		ontoggleEditor?: () => void;
		ontoggleVideo?: () => void;
		ontoggleTranscribeMode?: () => void;
		onopenUpload?: () => void;
		onopenHelp?: () => void;
		onopenSettings?: () => void;
		oncreateNewTranscript?: () => void;
		onwordSearch?: (term: string) => void;
		onconfigChange?: (data: { key: keyof ConfigStoreType; value: number }) => void;
	}

	let {
		selectedExample = '',
		isEditorVisible = false,
		isVideoVisible = false,
		isVideoLoaded = false,
		onloadExample,
		ontoggleEditor,
		ontoggleVideo,
		ontoggleTranscribeMode,
		onopenUpload,
		onopenHelp,
		onopenSettings,
		oncreateNewTranscript,
		onwordSearch,
		onconfigChange,
	}: Props = $props();

	let mobileMenuOpen = $state(false);
	let optionsFlyoutPanel = $state<string | null>(null);
	let vizDropdownOpen = $state(false);

	// --- Data ---

	const techniqueToggleOptions = ['speakerGardenToggle', 'turnChartToggle', 'contributionCloudToggle', 'turnNetworkToggle', 'wordRainToggle', 'speakerHeatmapToggle', 'turnLengthToggle', 'dashboardToggle'] as const;
	const regularVisualizationToggles = techniqueToggleOptions.filter((t) => t !== 'dashboardToggle');

	const exampleOptions = [
		{ value: 'example-1', label: 'Kindergarten Activity', icon: GraduationCap },
		{ value: 'example-3', label: '3rd Grade Discussion Odd/Even Numbers', icon: GraduationCap },
		{ value: 'example-4', label: '8th Grade Science Lesson', icon: GraduationCap },
		{ value: 'example-2', label: 'Family Gallery Visit', icon: Landmark },
		{ value: 'example-5', label: 'Biden-Trump 2020 Debate', icon: Mic }
	];

	const PANEL_LABELS: Record<string, string> = {
		speakerGarden: 'Speaker Garden',
		turnChart: 'Turn Chart',
		contributionCloud: 'Contribution Cloud',
		turnNetwork: 'Turn Network',
		wordRain: 'Word Rain',
		speakerHeatmap: 'Speaker Heatmap',
		turnLength: 'Turn Length'
	};

	const GARDEN_SORT_OPTIONS: { order: GardenSortOrder; label: string }[] = [
		{ order: 'default', label: 'Appearance' },
		{ order: 'words', label: 'Word Count' },
		{ order: 'turns', label: 'Turn Count' },
		{ order: 'alpha', label: 'A–Z' }
	];

	// --- Panel options config ---

	type PanelToggle = { type: 'toggle'; key: keyof ConfigStoreType; label: string };
	type PanelSlider = { type: 'slider'; key: keyof ConfigStoreType; label: string; min: number; max: number; formatValue?: (v: number) => string };
	type PanelGardenSort = { type: 'gardenSort' };
	type PanelOption = PanelToggle | PanelSlider | PanelGardenSort;

	const formatBinCount = (v: number) => v === 0 ? 'Auto' : String(v);

	const panelOptionsMap: Record<string, PanelOption[]> = {
		speakerGarden: [
			{ type: 'gardenSort' }
		],
		turnChart: [
			{ type: 'toggle', key: 'separateToggle', label: 'Group by Speaker' },
			{ type: 'toggle', key: 'silenceOverlapToggle', label: 'Silence Overlap' }
		],
		contributionCloud: [
			{ type: 'toggle', key: 'separateToggle', label: 'Group by Speaker' },
			{ type: 'toggle', key: 'sortToggle', label: 'Sort by Frequency' },
			{ type: 'toggle', key: 'lastWordToggle', label: 'Emphasize Last Word' },
			{ type: 'toggle', key: 'echoWordsToggle', label: 'Echo Last Words' },
			{ type: 'toggle', key: 'stopWordsToggle', label: 'Hide Stop Words' },
			{ type: 'toggle', key: 'repeatedWordsToggle', label: 'Only Repeated Words' },
			{ type: 'slider', key: 'repeatWordSliderValue', label: 'Size Range', min: 2, max: 30 }
		],
		wordRain: [
			{ type: 'toggle', key: 'separateToggle', label: 'Group by Speaker' },
			{ type: 'toggle', key: 'stopWordsToggle', label: 'Hide Stop Words' },
			{ type: 'toggle', key: 'wordRainTemporalBinning', label: 'Temporal Binning' },
			{ type: 'slider', key: 'wordRainMinFrequency', label: 'Min Frequency', min: 1, max: 10 },
			{ type: 'slider', key: 'wordRainBinCount', label: 'Bin Count', min: 4, max: 20 }
		],
		turnNetwork: [
			{ type: 'toggle', key: 'turnNetworkHideSelfLoops', label: 'Hide Self-Loops' },
			{ type: 'toggle', key: 'turnNetworkWeightByWords', label: 'Weight by Words' },
			{ type: 'slider', key: 'turnNetworkMinTransitions', label: 'Min Transitions', min: 1, max: 20 }
		],
		speakerHeatmap: [
			{ type: 'slider', key: 'heatmapBinCount', label: 'Bin Count', min: 0, max: 60, formatValue: formatBinCount }
		],
		turnLength: [
			{ type: 'slider', key: 'turnLengthBinCount', label: 'Bin Count', min: 0, max: 60, formatValue: formatBinCount }
		]
	};

	// --- Derived state ---

	let activePanelKey = $derived.by(() => {
		const activeToggle = techniqueToggleOptions.find((t) => $ConfigStore[t]);
		return activeToggle ? activeToggle.replace('Toggle', '') : '';
	});

	let activeVisualizationName = $derived(
		activePanelKey ? PANEL_LABELS[activePanelKey] ?? 'Dashboard' : 'Select'
	);

	let hiddenSliderKeys = $derived.by(() => {
		const hidden = new Set<keyof ConfigStoreType>();
		if (!$ConfigStore.wordRainTemporalBinning) hidden.add('wordRainBinCount');
		if (!$ConfigStore.repeatedWordsToggle) hidden.add('repeatWordSliderValue');
		return hidden;
	});

	let dashboardOptionsByPanel = $derived.by(() => {
		return $ConfigStore.dashboardPanels
			.filter((key) => key in panelOptionsMap)
			.map((key) => ({ key, label: PANEL_LABELS[key] ?? key, options: panelOptionsMap[key] }));
	});

	// --- Functions ---

	function formatToggleName(toggle: string) {
		if (toggle === 'dashboardToggle') return 'Dashboard';
		return PANEL_LABELS[toggle.replace('Toggle', '')] ?? toggle;
	}

	function isOptionVisible(option: PanelOption): boolean {
		return option.type !== 'slider' || !hiddenSliderKeys.has(option.key);
	}

	function toggleSelection(selection: string, toggleOptions: readonly string[]) {
		if (optionsFlyoutPanel !== null) {
			const panelKey = selection === 'dashboardToggle' ? 'dashboard' : selection.replace('Toggle', '');
			optionsFlyoutPanel = panelKey === 'dashboard' || panelOptionsMap[panelKey]?.length ? panelKey : null;
		}
		ConfigStore.update((store) => {
			const updates: Record<string, boolean> = {};
			toggleOptions.forEach((key) => {
				updates[key] = key === selection ? !store[key] : false;
			});
			return { ...store, ...updates };
		});
	}

	function toggleSelectionOnly(selection: string) {
		ConfigStore.update((store) => ({ ...store, [selection]: !store[selection] }));
	}

	function setGardenSort(order: GardenSortOrder) {
		ConfigStore.update((store) => ({ ...store, gardenSortOrder: order }));
	}

	function handleConfigChangeFromInput(e: Event, key: keyof ConfigStoreType) {
		onconfigChange?.({ key, value: parseFloat((e.target as HTMLInputElement).value) });
	}

	function handleWordSearch(event: Event) {
		const value = (event.target as HTMLInputElement).value;
		onwordSearch?.(value.trim());
	}

	function truncateExample(name: string): string {
		if (!name) return 'Examples';
		return name.length > 8 ? name.slice(0, 5) + '...' : name;
	}

	function toggleFlyout(panelKey: string, event: MouseEvent) {
		event.stopPropagation();
		optionsFlyoutPanel = optionsFlyoutPanel === panelKey ? null : panelKey;
	}

	function toggleVizDropdown() {
		vizDropdownOpen = !vizDropdownOpen;
		if (!vizDropdownOpen) optionsFlyoutPanel = null;
	}

	// --- Svelte actions ---

	function clickOutsideViz(node: HTMLElement) {
		const handleClick = (event: MouseEvent) => {
			if (!node.contains(event.target as Node)) {
				vizDropdownOpen = false;
				optionsFlyoutPanel = null;
			}
		};
		document.addEventListener('click', handleClick, true);
		return { destroy() { document.removeEventListener('click', handleClick, true); } };
	}

	function clickOutside(node: HTMLElement) {
		const handleClick = (event: MouseEvent) => {
			if (!node.contains(event.target as Node)) {
				node.removeAttribute('open');
			}
		};
		document.addEventListener('click', handleClick, true);
		return { destroy() { document.removeEventListener('click', handleClick, true); } };
	}
</script>

<div class="navbar min-h-16 bg-white">
	<div class="flex-1 px-2 xl:flex-none">
		<span class="text-2xl text-black italic">TRANSCRIPT EXPLORER</span>
	</div>

	<!-- Mobile hamburger button -->
	<button class="btn btn-ghost xl:hidden" onclick={() => (mobileMenuOpen = !mobileMenuOpen)} aria-label="Toggle menu">
		{#if mobileMenuOpen}
			<X size={24} />
		{:else}
			<Menu size={24} />
		{/if}
	</button>

	<!-- Desktop navigation -->
	<div class="hidden xl:flex justify-end flex-1 px-2 items-center gap-1">
		<!-- Example Data Dropdown -->
		<details class="dropdown" use:clickOutside data-tour="examples">
			<summary
				class="flex justify-between items-center rounded border border-gray-300 px-3 py-1.5 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
				title={selectedExample || 'Examples'}
			>
				<span class="truncate">{truncateExample(selectedExample)}</span>
				<svg class="w-3 h-3 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
				</svg>
			</summary>
			<ul class="menu dropdown-content rounded-box z-[1] w-56 p-2 shadow bg-base-100 max-h-[60vh] overflow-y-auto overflow-x-hidden">
				{#each exampleOptions as item}
					{@const Icon = item.icon}
					<li class="w-full">
						<button
							onclick={() => onloadExample?.(item.value)}
							class="text-sm w-full flex items-center gap-2 {selectedExample === item.label ? 'active' : ''}"
							title={item.label}
						>
							<Icon size={16} class="flex-shrink-0" />
							<span class="block truncate">{item.label}</span>
						</button>
					</li>
				{/each}
			</ul>
		</details>

		<div class="divider divider-horizontal mx-1 h-8"></div>

		<!-- Visualization Dropdown with Options Flyout -->
		<div class="relative" use:clickOutsideViz data-tour="viz-modes">
			<button class="btn btn-sm gap-1 flex items-center" title={activeVisualizationName} onclick={toggleVizDropdown}>
				<ChartBar size={16} />
				<span class="max-w-[6rem] truncate">{activeVisualizationName}</span>
				<svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
				</svg>
			</button>
			{#if vizDropdownOpen}
				<div class="absolute top-full left-0 mt-1 z-[1] flex">
					<ul class="menu rounded-box w-52 p-2 shadow bg-base-100">
						{#each regularVisualizationToggles as toggle}
							{@const isActive = $ConfigStore[toggle]}
							{@const panelKey = toggle.replace('Toggle', '')}
							{@const hasOptions = panelOptionsMap[panelKey]?.length > 0}
							<li>
								<div class="flex items-center w-full p-0 rounded {isActive ? 'bg-success/15' : ''}">
									<button onclick={() => toggleSelection(toggle, techniqueToggleOptions)} class="flex-1 text-left flex items-center px-3 py-1.5">
										<span class="w-4 h-4 mr-2 inline-flex items-center justify-center flex-shrink-0">
											{#if isActive}<Check size={16} />{/if}
										</span>
										{formatToggleName(toggle)}
									</button>
									{#if hasOptions}
										<button
											class="px-2 py-1.5 rounded hover:bg-base-200 flex-shrink-0 text-gray-400"
											onclick={(e) => toggleFlyout(panelKey, e)}
											title="Options"
										>
											<Settings2 size={14} />
										</button>
									{/if}
								</div>
							</li>
						{/each}
						<hr class="my-1 border-t border-gray-200" />
						<li>
							<div class="flex items-center w-full p-0 rounded {$ConfigStore.dashboardToggle ? 'bg-success/15' : ''}">
								<button onclick={() => toggleSelection('dashboardToggle', techniqueToggleOptions)} class="flex-1 text-left flex items-center px-3 py-1.5">
									<span class="w-4 h-4 mr-2 inline-flex items-center justify-center flex-shrink-0">
										{#if $ConfigStore.dashboardToggle}<Check size={16} />{/if}
									</span>
									Dashboard
								</button>
								{#if $ConfigStore.dashboardToggle && dashboardOptionsByPanel.length > 0}
									<button
										class="px-2 py-1.5 rounded hover:bg-base-200 flex-shrink-0 text-gray-400"
										onclick={(e) => toggleFlyout('dashboard', e)}
										title="Options"
									>
										<Settings2 size={14} />
									</button>
								{/if}
							</div>
						</li>
					</ul>

					{#snippet optionsList(options: PanelOption[])}
						{#each options as option}
							{#if isOptionVisible(option)}
								{#if option.type === 'toggle'}
									<button onclick={() => toggleSelectionOnly(option.key)} class="w-full text-left flex items-center text-sm py-1 px-1 rounded hover:bg-base-200">
										<span class="w-4 h-4 mr-2 inline-flex items-center justify-center flex-shrink-0">
											{#if $ConfigStore[option.key]}<Check size={14} />{/if}
										</span>
										{option.label}
									</button>
								{:else if option.type === 'slider'}
									<div class="py-1 px-1">
										<label for={option.key} class="text-sm text-gray-600">{option.label}: {option.formatValue ? option.formatValue($ConfigStore[option.key] as number) : $ConfigStore[option.key]}</label>
										<input
											id={option.key}
											type="range"
											min={option.min}
											max={option.max}
											value={$ConfigStore[option.key]}
											class="range range-sm w-full"
											oninput={(e) => handleConfigChangeFromInput(e, option.key)}
										/>
									</div>
								{:else if option.type === 'gardenSort'}
									{#each GARDEN_SORT_OPTIONS as sortOpt}
										<button onclick={() => setGardenSort(sortOpt.order)} class="w-full text-left flex items-center text-sm py-1 px-1 rounded hover:bg-base-200">
											<span class="w-4 h-4 mr-2 inline-flex items-center justify-center flex-shrink-0">
												{#if $ConfigStore.gardenSortOrder === sortOpt.order}<Check size={14} />{/if}
											</span>
											{sortOpt.label}
										</button>
									{/each}
								{/if}
							{/if}
						{/each}
					{/snippet}

					{#if optionsFlyoutPanel}
						<div class="rounded-box w-56 p-3 shadow bg-base-100 ml-1 max-h-[70vh] overflow-y-auto">
							{#if optionsFlyoutPanel === 'dashboard'}
								{#each dashboardOptionsByPanel as panel, i}
									<p class="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1 {i > 0 ? 'mt-3' : ''}">{panel.label}</p>
									{@render optionsList(panel.options)}
								{/each}
							{:else if panelOptionsMap[optionsFlyoutPanel]}
								{@render optionsList(panelOptionsMap[optionsFlyoutPanel])}
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Word Search -->
		<div class="relative flex items-center">
			<Search size={14} class="absolute left-2 text-gray-400 pointer-events-none" />
			<input
				type="text"
				placeholder="Filter words..."
				value={$ConfigStore.wordToSearch}
				oninput={handleWordSearch}
				class="input input-sm input-bordered pl-7 w-36 focus:w-48 transition-all duration-200"
			/>
		</div>

		<div class="divider divider-horizontal mx-1 h-8"></div>

		<!-- Panel Toggles -->
		<div class="flex items-center gap-1">
			<button
				class="btn btn-sm gap-1 {isEditorVisible ? 'btn-primary' : ''}"
				onclick={() => ontoggleEditor?.()}
				title={isEditorVisible ? 'Hide Editor' : 'Show Editor'}
			>
				<Text size={16} />
				Editor
			</button>
			<button
				class="btn btn-sm btn-square {isVideoVisible ? 'btn-primary' : ''}"
				onclick={() => ontoggleVideo?.()}
				title={isVideoVisible ? 'Hide Video' : 'Show Video'}
				disabled={!isVideoLoaded}
			>
				{#if isVideoVisible}
					<Video size={20} />
				{:else}
					<VideoOff size={20} />
				{/if}
			</button>
		</div>

		<div class="divider divider-horizontal mx-1 h-8"></div>

		<!-- Transcribe Mode -->
		<button
			class="btn btn-sm gap-1 btn-outline border-gray-400 hover:bg-gray-100 hover:border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
			onclick={() => ontoggleTranscribeMode?.()}
			title={isVideoLoaded ? 'Enter Transcribe Mode - focused video transcription workflow' : 'Load a video to enable Transcribe Mode'}
			disabled={!isVideoLoaded}
		>
			<Keyboard size={16} />
			Transcribe
		</button>

		<div class="divider divider-horizontal mx-1 h-8"></div>

		<!-- File & Settings Group -->
		<div class="flex items-center gap-1">
			<IconButton icon={CloudUpload} tooltip={'Upload Files'} onclick={() => onopenUpload?.()} />
			<IconButton icon={FilePlus} tooltip={'Create New Transcript'} onclick={() => oncreateNewTranscript?.()} />
			<IconButton icon={CircleHelp} tooltip={'Help'} onclick={() => onopenHelp?.()} />
			<IconButton icon={SettingsIcon} tooltip={'Settings'} onclick={() => onopenSettings?.()} />
		</div>
	</div>
</div>

<!-- Mobile menu dropdown -->
{#if mobileMenuOpen}
	<div class="xl:hidden bg-white border-b border-gray-200 shadow-lg">
		<div class="p-4 space-y-4">
			<!-- Example Data -->
			<div>
				<p class="text-xs uppercase tracking-wider text-gray-500 mb-2">Example Data</p>
				<select
					class="select select-bordered w-full"
					onchange={(e) => { onloadExample?.(e.currentTarget.value); mobileMenuOpen = false; }}
				>
					<option value="" disabled selected={!selectedExample}>Examples</option>
					{#each exampleOptions as item}
						<option value={item.value} selected={selectedExample === item.label}>{item.label}</option>
					{/each}
				</select>
			</div>

			<!-- Visualization Mode -->
			<div>
				<p class="text-xs uppercase tracking-wider text-gray-500 mb-2">Visualization</p>
				<div class="flex flex-wrap gap-2">
					{#each regularVisualizationToggles as toggle}
						<button
							class="btn btn-sm {$ConfigStore[toggle] ? 'btn-primary' : 'btn-ghost'}"
							onclick={() => { toggleSelection(toggle, techniqueToggleOptions); mobileMenuOpen = false; }}
						>
							{formatToggleName(toggle)}
						</button>
					{/each}
					<div class="w-full border-t border-gray-200 my-1"></div>
					<button
						class="btn btn-sm {$ConfigStore.dashboardToggle ? 'btn-primary' : 'btn-ghost'}"
						onclick={() => { toggleSelection('dashboardToggle', techniqueToggleOptions); mobileMenuOpen = false; }}
					>
						Dashboard
					</button>
				</div>
			</div>

			<!-- Search -->
			<div>
				<p class="text-xs uppercase tracking-wider text-gray-500 mb-2">Search</p>
				<input type="text" placeholder="Filter words..." value={$ConfigStore.wordToSearch} oninput={handleWordSearch} class="input input-bordered input-sm w-full" />
			</div>

			<!-- Options -->
			{#snippet mobileOptionsList(options: PanelOption[])}
				{#each options as option}
					{#if isOptionVisible(option)}
						{#if option.type === 'toggle'}
							<button class="btn btn-xs {$ConfigStore[option.key] ? 'btn-primary' : 'btn-ghost'}" onclick={() => toggleSelectionOnly(option.key)}>
								{option.label}
							</button>
						{:else if option.type === 'slider'}
							<div class="w-full mt-1">
								<label for={option.key} class="text-sm">{option.label}: {option.formatValue ? option.formatValue($ConfigStore[option.key] as number) : $ConfigStore[option.key]}</label>
								<input
									id={option.key}
									type="range"
									min={option.min}
									max={option.max}
									value={$ConfigStore[option.key]}
									class="range range-sm w-full"
									oninput={(e) => handleConfigChangeFromInput(e, option.key)}
								/>
							</div>
						{:else if option.type === 'gardenSort'}
							<div class="flex flex-wrap gap-1 w-full">
								{#each GARDEN_SORT_OPTIONS as sortOpt}
									<button
										class="btn btn-xs {$ConfigStore.gardenSortOrder === sortOpt.order ? 'btn-primary' : 'btn-ghost'}"
										onclick={() => setGardenSort(sortOpt.order)}
									>
										{sortOpt.label}
									</button>
								{/each}
							</div>
						{/if}
					{/if}
				{/each}
			{/snippet}
			<div>
				<p class="text-xs uppercase tracking-wider text-gray-500 mb-2">Options</p>
				{#if $ConfigStore.dashboardToggle}
					{#each dashboardOptionsByPanel as panel}
						<p class="text-xs uppercase tracking-wider text-gray-400 mt-2 mb-1">{panel.label}</p>
						<div class="flex flex-wrap gap-2">
							{@render mobileOptionsList(panel.options)}
						</div>
					{/each}
				{:else if activePanelKey && panelOptionsMap[activePanelKey]}
					<div class="flex flex-wrap gap-2">
						{@render mobileOptionsList(panelOptionsMap[activePanelKey])}
					</div>
				{/if}
			</div>

			<!-- Quick Actions -->
			<div>
				<p class="text-xs uppercase tracking-wider text-gray-500 mb-2">Actions</p>
				<div class="flex flex-wrap gap-2">
					<button
						class="btn btn-sm {isEditorVisible ? 'btn-primary' : 'btn-ghost'}"
						onclick={() => { ontoggleEditor?.(); mobileMenuOpen = false; }}
					>
						<Text size={16} class="mr-1" />
						Editor
					</button>
					<button
						class="btn btn-sm {isVideoVisible ? 'btn-primary' : 'btn-ghost'}"
						onclick={() => { ontoggleVideo?.(); mobileMenuOpen = false; }}
						disabled={!isVideoLoaded}
					>
						{#if isVideoVisible}
							<Video size={16} class="mr-1" />
						{:else}
							<VideoOff size={16} class="mr-1" />
						{/if}
						Video
					</button>
					<button
						class="btn btn-sm btn-outline border-gray-400 disabled:opacity-50"
						onclick={() => { ontoggleTranscribeMode?.(); mobileMenuOpen = false; }}
						disabled={!isVideoLoaded}
					>
						<Keyboard size={16} class="mr-1" />
						Transcribe
					</button>
					<button class="btn btn-sm btn-ghost" onclick={() => { onopenUpload?.(); mobileMenuOpen = false; }}>
						<CloudUpload size={16} class="mr-1" />
						Upload
					</button>
					<button class="btn btn-sm btn-ghost" onclick={() => { oncreateNewTranscript?.(); mobileMenuOpen = false; }}>
						<FilePlus size={16} class="mr-1" />
						New
					</button>
					<button class="btn btn-sm btn-ghost" onclick={() => { onopenHelp?.(); mobileMenuOpen = false; }}>
						<CircleHelp size={16} class="mr-1" />
						Help
					</button>
					<button class="btn btn-sm btn-ghost" onclick={() => { onopenSettings?.(); mobileMenuOpen = false; }}>
						<SettingsIcon size={16} class="mr-1" />
						Settings
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
