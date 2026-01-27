<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import MdHelpOutline from 'svelte-icons/md/MdHelpOutline.svelte';
	import MdCloudUpload from 'svelte-icons/md/MdCloudUpload.svelte';
	import MdNoteAdd from 'svelte-icons/md/MdNoteAdd.svelte';
	import MdVideocam from 'svelte-icons/md/MdVideocam.svelte';
	import MdVideocamOff from 'svelte-icons/md/MdVideocamOff.svelte';
	import MdCheck from 'svelte-icons/md/MdCheck.svelte';
	import MdSettings from 'svelte-icons/md/MdSettings.svelte';
	import MdSubject from 'svelte-icons/md/MdSubject.svelte';
	import MdInsertChart from 'svelte-icons/md/MdInsertChart.svelte';
	import MdTune from 'svelte-icons/md/MdTune.svelte';
	import MdMenu from 'svelte-icons/md/MdMenu.svelte';
	import MdClose from 'svelte-icons/md/MdClose.svelte';
	import MdKeyboard from 'svelte-icons/md/MdKeyboard.svelte';
	import MdSchool from 'svelte-icons/md/MdSchool.svelte';
	import MdAccountBalance from 'svelte-icons/md/MdAccountBalance.svelte';
	import MdRecordVoiceOver from 'svelte-icons/md/MdRecordVoiceOver.svelte';
	import IconButton from './IconButton.svelte';
	import ConfigStore from '../../stores/configStore';
	import type { ConfigStoreType } from '../../stores/configStore';

	const dispatch = createEventDispatcher<{
		loadExample: string;
		toggleEditor: void;
		toggleVideo: void;
		toggleTranscribeMode: void;
		openUpload: void;
		openHelp: void;
		openSettings: void;
		createNewTranscript: void;
		wordSearch: string;
		configChange: { key: keyof ConfigStoreType; value: number };
	}>();

	export let selectedExample: string = '';
	export let isEditorVisible: boolean = false;
	export let isVideoVisible: boolean = false;
	export let isVideoLoaded: boolean = false;

	let mobileMenuOpen = false;

	const techniqueToggleOptions = ['distributionDiagramToggle', 'turnChartToggle', 'contributionCloudToggle', 'dashboardToggle'] as const;

	const distributionDiagramInteractions = ['flowersToggle'] as const;
	const turnChartInteractions = ['separateToggle'] as const;
	const contributionCloudInteractions = [
		'separateToggle',
		'sortToggle',
		'lastWordToggle',
		'echoWordsToggle',
		'stopWordsToggle',
		'repeatedWordsToggle'
	] as const;
	const allInteractions = [...new Set([...distributionDiagramInteractions, ...turnChartInteractions, ...contributionCloudInteractions])] as const;

	const exampleOptions = [
		{ value: 'example-1', label: 'Kindergarten Activity', icon: MdSchool },
		{ value: 'example-3', label: '3rd Grade Discussion Odd/Even Numbers', icon: MdSchool },
		{ value: 'example-4', label: '8th Grade Science Lesson', icon: MdSchool },
		{ value: 'example-2', label: 'Family Gallery Visit', icon: MdAccountBalance },
		{ value: 'example-5', label: 'Biden-Trump 2020 Debate', icon: MdRecordVoiceOver }
	];

	$: visibleInteractions = $ConfigStore.dashboardToggle
		? allInteractions
		: $ConfigStore.distributionDiagramToggle
			? distributionDiagramInteractions
			: $ConfigStore.turnChartToggle
				? turnChartInteractions
				: $ConfigStore.contributionCloudToggle
					? contributionCloudInteractions
					: allInteractions;

	$: showRepeatedWordsSlider = $ConfigStore.contributionCloudToggle || $ConfigStore.dashboardToggle;

	$: activeVisualization = techniqueToggleOptions.find((t) => $ConfigStore[t]) || '';
	$: activeVisualizationName = activeVisualization ? formatToggleName(activeVisualization) : 'Select';

	function formatToggleName(toggle: string) {
		return toggle
			.replace('Toggle', '')
			.replace(/([A-Z])/g, ' $1')
			.trim()
			.replace(/^./, (str) => str.toUpperCase());
	}

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

	function handleConfigChangeFromInput(e: Event, key: keyof ConfigStoreType) {
		const target = e.target as HTMLInputElement;
		dispatch('configChange', { key, value: parseFloat(target.value) });
	}

	function handleWordSearch(event: Event) {
		const target = event.target as HTMLInputElement;
		dispatch('wordSearch', target.value.trim());
	}

	function loadExample(exampleId: string) {
		dispatch('loadExample', exampleId);
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
	<button class="btn btn-ghost xl:hidden" on:click={() => (mobileMenuOpen = !mobileMenuOpen)} aria-label="Toggle menu">
		<div class="w-6 h-6">
			{#if mobileMenuOpen}
				<MdClose />
			{:else}
				<MdMenu />
			{/if}
		</div>
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
					<li class="w-full">
						<button
							on:click={() => loadExample(item.value)}
							class="text-sm w-full flex items-center gap-2 {selectedExample === item.label ? 'active' : ''}"
							title={item.label}
						>
							<div class="w-4 h-4 flex-shrink-0"><svelte:component this={item.icon} /></div>
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
					<div class="w-4 h-4">
						<MdInsertChart />
					</div>
					<span class="max-w-[4rem] truncate">{activeVisualizationName}</span>
					<svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
				</summary>
				<ul class="menu dropdown-content rounded-box z-[1] w-52 p-2 shadow bg-base-100">
					{#each techniqueToggleOptions as toggle}
						<li>
							<button on:click={() => toggleSelection(toggle, techniqueToggleOptions)} class="w-full text-left flex items-center">
								<div class="w-4 h-4 mr-2">
									{#if $ConfigStore[toggle]}
										<MdCheck />
									{/if}
								</div>
								{formatToggleName(toggle)}
							</button>
						</li>
					{/each}
				</ul>
			</details>

			<!-- Options Dropdown -->
			<details class="dropdown" use:clickOutside data-tour="interactions">
				<summary class="btn btn-sm gap-1 flex items-center">
					<div class="w-4 h-4">
						<MdTune />
					</div>
					Options
					<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
				</summary>
				<ul class="menu dropdown-content rounded-box z-[1] w-52 p-2 shadow bg-base-100">
					{#each visibleInteractions as toggle}
						<li>
							<button on:click={() => toggleSelectionOnly(toggle)} class="w-full text-left flex items-center">
								<div class="w-4 h-4 mr-2">
									{#if $ConfigStore[toggle]}
										<MdCheck />
									{/if}
								</div>
								{formatToggleName(toggle)}
							</button>
						</li>
					{/each}
					{#if showRepeatedWordsSlider}
						<li class="cursor-default">
							<p>Repeated Word Filter: {$ConfigStore.repeatWordSliderValue}</p>
						</li>
						<li>
							<label for="repeatWordRange" class="sr-only">Repeated word filter</label>
							<input
								id="repeatWordRange"
								type="range"
								min="2"
								max="30"
								value={$ConfigStore.repeatWordSliderValue}
								class="range"
								on:input={(e) => handleConfigChangeFromInput(e, 'repeatWordSliderValue')}
							/>
						</li>
					{/if}
					<hr class="my-4 border-t border-gray-300" />
					<input type="text" placeholder="Search conversations..." on:input={handleWordSearch} class="input input-bordered w-full" />
				</ul>
			</details>
		</div>

		<!-- Divider -->
		<div class="divider divider-horizontal mx-1 h-8"></div>

		<!-- Panel Toggles -->
		<div class="flex items-center gap-1">
			<button
				class="btn btn-sm gap-1 {isEditorVisible ? 'btn-primary' : ''}"
				on:click={() => dispatch('toggleEditor')}
				title={isEditorVisible ? 'Hide Editor' : 'Show Editor'}
			>
				<div class="w-4 h-4">
					<MdSubject />
				</div>
				Editor
			</button>
			<button
				class="btn btn-sm btn-square {isVideoVisible ? 'btn-primary' : ''}"
				on:click={() => dispatch('toggleVideo')}
				title={isVideoVisible ? 'Hide Video' : 'Show Video'}
				disabled={!isVideoLoaded}
			>
				<div class="w-5 h-5">
					{#if isVideoVisible}
						<MdVideocam />
					{:else}
						<MdVideocamOff />
					{/if}
				</div>
			</button>
		</div>

		<!-- Divider -->
		<div class="divider divider-horizontal mx-1 h-8"></div>

		<!-- Transcribe Mode -->
		<button
			class="btn btn-sm gap-1 btn-outline border-gray-400 hover:bg-gray-100 hover:border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
			on:click={() => dispatch('toggleTranscribeMode')}
			title={isVideoLoaded ? 'Enter Transcribe Mode - focused video transcription workflow' : 'Load a video to enable Transcribe Mode'}
			disabled={!isVideoLoaded}
		>
			<div class="w-4 h-4">
				<MdKeyboard />
			</div>
			Transcribe
		</button>

		<!-- Divider -->
		<div class="divider divider-horizontal mx-1 h-8"></div>

		<!-- File & Settings Group -->
		<div class="flex items-center gap-1">
			<IconButton icon={MdCloudUpload} tooltip={'Upload Files'} on:click={() => dispatch('openUpload')} />
			<IconButton icon={MdNoteAdd} tooltip={'Create New Transcript'} on:click={() => dispatch('createNewTranscript')} />
			<IconButton icon={MdHelpOutline} tooltip={'Help'} on:click={() => dispatch('openHelp')} />
			<IconButton icon={MdSettings} tooltip={'Settings'} on:click={() => dispatch('openSettings')} />
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
					on:change={(e) => {
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
							on:click={() => {
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
						<button class="btn btn-sm {$ConfigStore[toggle] ? 'btn-primary' : 'btn-ghost'}" on:click={() => toggleSelectionOnly(toggle)}>
							{formatToggleName(toggle)}
						</button>
					{/each}
				</div>
				{#if showRepeatedWordsSlider}
					<div class="mt-2">
						<label for="repeatWordRangeMobile" class="text-sm">Repeated Word Filter: {$ConfigStore.repeatWordSliderValue}</label>
						<input
							id="repeatWordRangeMobile"
							type="range"
							min="2"
							max="30"
							value={$ConfigStore.repeatWordSliderValue}
							class="range range-sm w-full"
							on:input={(e) => handleConfigChangeFromInput(e, 'repeatWordSliderValue')}
						/>
					</div>
				{/if}
				<input type="text" placeholder="Search conversations..." on:input={handleWordSearch} class="input input-bordered input-sm w-full mt-2" />
			</div>

			<!-- Quick Actions -->
			<div>
				<p class="text-xs uppercase tracking-wider text-gray-500 mb-2">Actions</p>
				<div class="flex flex-wrap gap-2">
					<button
						class="btn btn-sm {isEditorVisible ? 'btn-primary' : 'btn-ghost'}"
						on:click={() => {
							dispatch('toggleEditor');
							mobileMenuOpen = false;
						}}
					>
						<div class="w-4 h-4 mr-1"><MdSubject /></div>
						Editor
					</button>
					<button
						class="btn btn-sm {isVideoVisible ? 'btn-primary' : 'btn-ghost'}"
						on:click={() => {
							dispatch('toggleVideo');
							mobileMenuOpen = false;
						}}
						disabled={!isVideoLoaded}
					>
						<div class="w-4 h-4 mr-1">
							{#if isVideoVisible}
								<MdVideocam />
							{:else}
								<MdVideocamOff />
							{/if}
						</div>
						Video
					</button>
					<button
						class="btn btn-sm btn-outline border-gray-400 disabled:opacity-50"
						on:click={() => {
							dispatch('toggleTranscribeMode');
							mobileMenuOpen = false;
						}}
						disabled={!isVideoLoaded}
					>
						<div class="w-4 h-4 mr-1"><MdKeyboard /></div>
						Transcribe
					</button>
					<button
						class="btn btn-sm btn-ghost"
						on:click={() => {
							dispatch('openUpload');
							mobileMenuOpen = false;
						}}
					>
						<div class="w-4 h-4 mr-1"><MdCloudUpload /></div>
						Upload
					</button>
					<button
						class="btn btn-sm btn-ghost"
						on:click={() => {
							dispatch('createNewTranscript');
							mobileMenuOpen = false;
						}}
					>
						<div class="w-4 h-4 mr-1"><MdNoteAdd /></div>
						New
					</button>
					<button
						class="btn btn-sm btn-ghost"
						on:click={() => {
							dispatch('openHelp');
							mobileMenuOpen = false;
						}}
					>
						<div class="w-4 h-4 mr-1"><MdHelpOutline /></div>
						Help
					</button>
					<button
						class="btn btn-sm btn-ghost"
						on:click={() => {
							dispatch('openSettings');
							mobileMenuOpen = false;
						}}
					>
						<div class="w-4 h-4 mr-1"><MdSettings /></div>
						Settings
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
