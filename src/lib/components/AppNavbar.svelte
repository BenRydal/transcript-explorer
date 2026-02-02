<script lang="ts">
	import { CircleHelp, CloudUpload, FilePlus, Video, VideoOff, Check, Settings, Text, ChartBar, SlidersHorizontal, Menu, X, Keyboard, GraduationCap, Landmark, Mic } from '@lucide/svelte';
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

	const techniqueToggleOptions = ['speakerGardenToggle', 'turnChartToggle', 'contributionCloudToggle', 'turnNetworkToggle', 'wordRainToggle', 'speakerHeatmapToggle', 'turnLengthToggle', 'dashboardToggle'] as const;

	const panelInteractionMap: Record<string, readonly (keyof ConfigStoreType)[]> = {
		speakerGarden: [],
		turnChart: ['separateToggle', 'silenceOverlapToggle'],
		contributionCloud: ['separateToggle', 'sortToggle', 'lastWordToggle', 'echoWordsToggle', 'stopWordsToggle', 'repeatedWordsToggle'],
		wordRain: ['separateToggle', 'stopWordsToggle'],
		turnNetwork: [],
		speakerHeatmap: [],
		turnLength: []
	};

	const exampleOptions = [
		{ value: 'example-1', label: 'Kindergarten Activity', icon: GraduationCap },
		{ value: 'example-3', label: '3rd Grade Discussion Odd/Even Numbers', icon: GraduationCap },
		{ value: 'example-4', label: '8th Grade Science Lesson', icon: GraduationCap },
		{ value: 'example-2', label: 'Family Gallery Visit', icon: Landmark },
		{ value: 'example-5', label: 'Biden-Trump 2020 Debate', icon: Mic }
	];

	function getInteractionsForPanels(panelKeys: string[]): (keyof ConfigStoreType)[] {
		const set = new Set<keyof ConfigStoreType>();
		for (const key of panelKeys) {
			for (const interaction of (panelInteractionMap[key] ?? [])) {
				set.add(interaction);
			}
		}
		return [...set];
	}

	let visibleInteractions = $derived.by(() => {
		if ($ConfigStore.dashboardToggle) {
			return getInteractionsForPanels($ConfigStore.dashboardPanels);
		}
		const activeToggle = techniqueToggleOptions.find((t) => $ConfigStore[t]);
		if (!activeToggle) return getInteractionsForPanels(Object.keys(panelInteractionMap));
		const panelKey = activeToggle.replace('Toggle', '');
		return panelKey in panelInteractionMap ? getInteractionsForPanels([panelKey]) : [];
	});

	let showRepeatedWordsSlider = $derived(
		$ConfigStore.contributionCloudToggle ||
		($ConfigStore.dashboardToggle && $ConfigStore.dashboardPanels.includes('contributionCloud'))
	);

	const TOGGLE_LABELS: Record<string, string> = {
		// Visualizations
		speakerGardenToggle: 'Speaker Garden',
		turnChartToggle: 'Turn Chart',
		contributionCloudToggle: 'Contribution Cloud',
		turnNetworkToggle: 'Turn Network',
		wordRainToggle: 'Word Rain',
		speakerHeatmapToggle: 'Speaker Heatmap',
		turnLengthToggle: 'Turn Length',
		dashboardToggle: 'Dashboard',
		// Options
		separateToggle: 'Group by Speaker',
		silenceOverlapToggle: 'Silence Overlap',
		sortToggle: 'Sort by Frequency',
		lastWordToggle: 'Emphasize Last Word',
		echoWordsToggle: 'Echo Last Words',
		stopWordsToggle: 'Hide Stop Words',
		repeatedWordsToggle: 'Only Repeated Words'
	};

	function formatToggleName(toggle: string) {
		return TOGGLE_LABELS[toggle] ?? toggle;
	}

	let activeVisualization = $derived(techniqueToggleOptions.find((t) => $ConfigStore[t]) || '');
	let activeVisualizationName = $derived(activeVisualization ? formatToggleName(activeVisualization) : 'Select');

	function toggleSelection(selection: string, toggleOptions: readonly string[]) {
		ConfigStore.update((store) => {
			const updates: Record<string, boolean> = {};
			toggleOptions.forEach((key) => {
				updates[key] = key === selection ? !store[key] : false;
			});
			return { ...store, ...updates };
		});
	}

	function toggleSelectionOnly(selection: string) {
		ConfigStore.update((store) => ({
			...store,
			[selection]: !store[selection]
		}));
	}

	const GARDEN_SORT_CYCLE: GardenSortOrder[] = ['default', 'words', 'turns', 'alpha'];
	const GARDEN_SORT_LABELS: Record<GardenSortOrder, string> = {
		default: 'Sort by Appearance',
		words: 'Sort by Word Count',
		turns: 'Sort by Turn Count',
		alpha: 'Sort by A–Z'
	};

	let showGardenSort = $derived(
		$ConfigStore.speakerGardenToggle ||
		($ConfigStore.dashboardToggle && $ConfigStore.dashboardPanels.includes('speakerGarden'))
	);

	function cycleGardenSort() {
		ConfigStore.update((store) => {
			const idx = GARDEN_SORT_CYCLE.indexOf(store.gardenSortOrder);
			const next = GARDEN_SORT_CYCLE[(idx + 1) % GARDEN_SORT_CYCLE.length];
			return { ...store, gardenSortOrder: next };
		});
	}

	function handleConfigChangeFromInput(e: Event, key: keyof ConfigStoreType) {
		const target = e.target as HTMLInputElement;
		onconfigChange?.({ key, value: parseFloat(target.value) });
	}

	function handleWordSearch(event: Event) {
		const target = event.target as HTMLInputElement;
		onwordSearch?.(target.value.trim());
	}

	function loadExample(exampleId: string) {
		onloadExample?.(exampleId);
	}

	function truncateExample(name: string): string {
		if (!name) return 'Examples';
		return name.length > 8 ? name.slice(0, 5) + '...' : name;
	}

	function clickOutside(node: HTMLElement) {
		const handleClick = (event: MouseEvent) => {
			if (!node.contains(event.target as Node)) {
				node.removeAttribute('open');
			}
		};

		document.addEventListener('click', handleClick, true);

		return {
			destroy() {
				document.removeEventListener('click', handleClick, true);
			}
		};
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
							onclick={() => loadExample(item.value)}
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

		<!-- Divider -->
		<div class="divider divider-horizontal mx-1 h-8"></div>

		<!-- Visualization Settings -->
		<div class="flex items-center gap-2" data-tour="viz-modes">
			<!-- Visualizations Dropdown -->
			<details class="dropdown" use:clickOutside>
				<summary class="btn btn-sm gap-1 flex items-center" title={activeVisualizationName}>
					<ChartBar size={16} />
					<span class="max-w-[4rem] truncate">{activeVisualizationName}</span>
					<svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
				</summary>
				<ul class="menu dropdown-content rounded-box z-[1] w-52 p-2 shadow bg-base-100">
					{#each techniqueToggleOptions as toggle}
						<li>
							<button onclick={() => toggleSelection(toggle, techniqueToggleOptions)} class="w-full text-left flex items-center">
								<span class="w-4 h-4 mr-2 inline-flex items-center justify-center">
									{#if $ConfigStore[toggle]}
										<Check size={16} />
									{/if}
								</span>
								{formatToggleName(toggle)}
							</button>
						</li>
					{/each}
				</ul>
			</details>

			<!-- Options Dropdown -->
			<details class="dropdown" use:clickOutside data-tour="interactions">
				<summary class="btn btn-sm gap-1 flex items-center">
					<SlidersHorizontal size={16} />
					Options
					<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
				</summary>
				<ul class="menu dropdown-content rounded-box z-[1] w-52 p-2 shadow bg-base-100 max-h-[70vh] overflow-y-auto">
					{#each visibleInteractions as toggle}
						<li>
							<button onclick={() => toggleSelectionOnly(toggle)} class="w-full text-left flex items-center">
								<span class="w-4 h-4 mr-2 inline-flex items-center justify-center">
									{#if $ConfigStore[toggle]}
										<Check size={16} />
									{/if}
								</span>
								{formatToggleName(toggle)}
							</button>
						</li>
					{/each}
					{#if showGardenSort}
						<li>
							<button onclick={cycleGardenSort} class="w-full text-left flex items-center">
								{GARDEN_SORT_LABELS[$ConfigStore.gardenSortOrder]}
							</button>
						</li>
					{/if}
					{#if showRepeatedWordsSlider}
						<li class="cursor-default">
							<p>Size Range: {$ConfigStore.repeatWordSliderValue}</p>
						</li>
						<li>
							<label for="repeatWordRange" class="sr-only">Word size range</label>
							<input
								id="repeatWordRange"
								type="range"
								min="2"
								max="30"
								value={$ConfigStore.repeatWordSliderValue}
								class="range"
								oninput={(e) => handleConfigChangeFromInput(e, 'repeatWordSliderValue')}
							/>
						</li>
					{/if}
					<hr class="my-4 border-t border-gray-300" />
					<input type="text" placeholder="Filter words..." oninput={handleWordSearch} class="input input-bordered w-full" />
				</ul>
			</details>
		</div>

		<!-- Divider -->
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

		<!-- Divider -->
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

		<!-- Divider -->
		<div class="divider divider-horizontal mx-1 h-8"></div>

		<!-- File & Settings Group -->
		<div class="flex items-center gap-1">
			<IconButton icon={CloudUpload} tooltip={'Upload Files'} onclick={() => onopenUpload?.()} />
			<IconButton icon={FilePlus} tooltip={'Create New Transcript'} onclick={() => oncreateNewTranscript?.()} />
			<IconButton icon={CircleHelp} tooltip={'Help'} onclick={() => onopenHelp?.()} />
			<IconButton icon={Settings} tooltip={'Settings'} onclick={() => onopenSettings?.()} />
		</div>
	</div>
</div>

<!-- Mobile menu dropdown -->
{#if mobileMenuOpen}
	<div class="xl:hidden bg-white border-b border-gray-200 shadow-lg">
		<div class="p-4 space-y-4">
			<!-- Example Data Section -->
			<div>
				<p class="text-xs uppercase tracking-wider text-gray-500 mb-2">Example Data</p>
				<select
					class="select select-bordered w-full"
					onchange={(e) => {
						loadExample(e.currentTarget.value);
						mobileMenuOpen = false;
					}}
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
					{#each techniqueToggleOptions as toggle}
						<button
							class="btn btn-sm {$ConfigStore[toggle] ? 'btn-primary' : 'btn-ghost'}"
							onclick={() => {
								toggleSelection(toggle, techniqueToggleOptions);
								mobileMenuOpen = false;
							}}
						>
							{formatToggleName(toggle)}
						</button>
					{/each}
				</div>
			</div>

			<!-- Options -->
			<div>
				<p class="text-xs uppercase tracking-wider text-gray-500 mb-2">Options</p>
				<div class="flex flex-wrap gap-2">
					{#each visibleInteractions as toggle}
						<button class="btn btn-sm {$ConfigStore[toggle] ? 'btn-primary' : 'btn-ghost'}" onclick={() => toggleSelectionOnly(toggle)}>
							{formatToggleName(toggle)}
						</button>
					{/each}
				</div>
				{#if showGardenSort}
					<button class="btn btn-sm {$ConfigStore.gardenSortOrder !== 'default' ? 'btn-primary' : 'btn-ghost'}" onclick={cycleGardenSort}>
						{GARDEN_SORT_LABELS[$ConfigStore.gardenSortOrder]}
					</button>
				{/if}
				{#if showRepeatedWordsSlider}
					<div class="mt-2">
						<label for="repeatWordRangeMobile" class="text-sm">Size Range: {$ConfigStore.repeatWordSliderValue}</label>
						<input
							id="repeatWordRangeMobile"
							type="range"
							min="2"
							max="30"
							value={$ConfigStore.repeatWordSliderValue}
							class="range range-sm w-full"
							oninput={(e) => handleConfigChangeFromInput(e, 'repeatWordSliderValue')}
						/>
					</div>
				{/if}
				<input type="text" placeholder="Filter words..." oninput={handleWordSearch} class="input input-bordered input-sm w-full mt-2" />
			</div>

			<!-- Quick Actions -->
			<div>
				<p class="text-xs uppercase tracking-wider text-gray-500 mb-2">Actions</p>
				<div class="flex flex-wrap gap-2">
					<button
						class="btn btn-sm {isEditorVisible ? 'btn-primary' : 'btn-ghost'}"
						onclick={() => {
							ontoggleEditor?.();
							mobileMenuOpen = false;
						}}
					>
						<Text size={16} class="mr-1" />
						Editor
					</button>
					<button
						class="btn btn-sm {isVideoVisible ? 'btn-primary' : 'btn-ghost'}"
						onclick={() => {
							ontoggleVideo?.();
							mobileMenuOpen = false;
						}}
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
						onclick={() => {
							ontoggleTranscribeMode?.();
							mobileMenuOpen = false;
						}}
						disabled={!isVideoLoaded}
					>
						<Keyboard size={16} class="mr-1" />
						Transcribe
					</button>
					<button
						class="btn btn-sm btn-ghost"
						onclick={() => {
							onopenUpload?.();
							mobileMenuOpen = false;
						}}
					>
						<CloudUpload size={16} class="mr-1" />
						Upload
					</button>
					<button
						class="btn btn-sm btn-ghost"
						onclick={() => {
							oncreateNewTranscript?.();
							mobileMenuOpen = false;
						}}
					>
						<FilePlus size={16} class="mr-1" />
						New
					</button>
					<button
						class="btn btn-sm btn-ghost"
						onclick={() => {
							onopenHelp?.();
							mobileMenuOpen = false;
						}}
					>
						<CircleHelp size={16} class="mr-1" />
						Help
					</button>
					<button
						class="btn btn-sm btn-ghost"
						onclick={() => {
							onopenSettings?.();
							mobileMenuOpen = false;
						}}
					>
						<Settings size={16} class="mr-1" />
						Settings
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
