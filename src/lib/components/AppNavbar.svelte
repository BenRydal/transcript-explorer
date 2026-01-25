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
	import MdTouchApp from 'svelte-icons/md/MdTouchApp.svelte';
	import MdMenu from 'svelte-icons/md/MdMenu.svelte';
	import MdClose from 'svelte-icons/md/MdClose.svelte';
	import MdKeyboard from 'svelte-icons/md/MdKeyboard.svelte';
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

	const dropdownOptions = [
		{
			label: 'Classrooms',
			items: [
				{ value: 'example-1', label: 'Kindergarten Activity' },
				{ value: 'example-3', label: 'Classroom Discussion' },
				{ value: 'example-4', label: 'Classroom Science Lesson' }
			]
		},
		{ label: 'Museums', items: [{ value: 'example-2', label: 'Family Gallery Visit' }] },
		{
			label: 'Presidential Debates',
			items: [{ value: 'example-5', label: 'Biden-Trump 2020 Debate' }]
		}
	];

	// Compute visible interactions based on active visualization
	$: visibleInteractions = (() => {
		if ($ConfigStore.dashboardToggle) {
			return allInteractions;
		} else if ($ConfigStore.distributionDiagramToggle) {
			return distributionDiagramInteractions;
		} else if ($ConfigStore.turnChartToggle) {
			return turnChartInteractions;
		} else if ($ConfigStore.contributionCloudToggle) {
			return contributionCloudInteractions;
		}
		return allInteractions;
	})();

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

<div class="navbar min-h-16 bg-[#ffffff]">
	<div class="flex-1 px-2 lg:flex-none">
		<span class="text-2xl text-black italic">TRANSCRIPT EXPLORER</span>
	</div>

	<!-- Mobile hamburger button -->
	<button class="btn btn-ghost md:hidden" on:click={() => (mobileMenuOpen = !mobileMenuOpen)} aria-label="Toggle menu">
		<div class="w-6 h-6">
			{#if mobileMenuOpen}
				<MdClose />
			{:else}
				<MdMenu />
			{/if}
		</div>
	</button>

	<!-- Desktop navigation -->
	<div class="hidden md:flex justify-end flex-1 px-2 items-center gap-1">
		<!-- Example Data Dropdown -->
		<details class="dropdown" use:clickOutside data-tour="examples">
			<summary
				class="flex justify-between items-center min-w-[180px] rounded border border-gray-300 px-3 py-1.5 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
			>
				<span class="truncate">{selectedExample || 'Select an Example'}</span>
				<svg class="w-3 h-3 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
				</svg>
			</summary>
			<ul class="menu dropdown-content rounded-box z-[1] w-56 p-2 shadow bg-base-100 max-h-[60vh] overflow-y-auto">
				{#each dropdownOptions as group}
					<li class="menu-title text-xs uppercase tracking-wider text-gray-500 pt-2">
						{group.label}
					</li>
					{#each group.items as item}
						<li>
							<button on:click={() => loadExample(item.value)} class="text-sm {selectedExample === item.label ? 'active' : ''}">
								{item.label}
							</button>
						</li>
					{/each}
				{/each}
			</ul>
		</details>

		<!-- Divider -->
		<div class="divider divider-horizontal mx-1 h-8"></div>

		<!-- Visualization Controls Group -->
		<div class="flex items-center gap-2">
			<!-- Visualizations Dropdown -->
			<details class="dropdown" use:clickOutside data-tour="viz-modes">
				<summary class="btn btn-sm gap-1 flex items-center">
					<div class="w-4 h-4">
						<MdInsertChart />
					</div>
					{activeVisualizationName}
					<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

			<!-- Interactions & Editor -->
			<div class="flex items-center gap-2" data-tour="interactions">
				<details class="dropdown" use:clickOutside>
					<summary class="btn btn-sm gap-1 flex items-center">
						<div class="w-4 h-4">
							<MdTouchApp />
						</div>
						Interactions
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

				<!-- Editor Toggle -->
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
			</div>

			<!-- Video Toggle -->
			<IconButton
				icon={isVideoVisible ? MdVideocam : MdVideocamOff}
				tooltip={isVideoVisible ? 'Hide Video' : 'Show Video'}
				on:click={() => dispatch('toggleVideo')}
				disabled={!isVideoLoaded}
			/>

			<!-- Transcribe Mode Toggle -->
			{#if isVideoLoaded}
				<button
					class="btn btn-sm gap-1"
					on:click={() => dispatch('toggleTranscribeMode')}
					title="Enter Transcribe Mode"
				>
					<div class="w-4 h-4">
						<MdKeyboard />
					</div>
					Transcribe
				</button>
			{/if}
		</div>

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
	<div class="md:hidden bg-white border-b border-gray-200 shadow-lg">
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
					<option value="" disabled selected={!selectedExample}>Select an Example</option>
					{#each dropdownOptions as group}
						<optgroup label={group.label}>
							{#each group.items as item}
								<option value={item.value} selected={selectedExample === item.label}>{item.label}</option>
							{/each}
						</optgroup>
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

			<!-- Interactions -->
			<div>
				<p class="text-xs uppercase tracking-wider text-gray-500 mb-2">Interactions</p>
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
						class="btn btn-sm btn-ghost"
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
					{#if isVideoLoaded}
						<button
							class="btn btn-sm btn-ghost"
							on:click={() => {
								dispatch('toggleTranscribeMode');
								mobileMenuOpen = false;
							}}
						>
							<div class="w-4 h-4 mr-1"><MdKeyboard /></div>
							Transcribe
						</button>
					{/if}
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
