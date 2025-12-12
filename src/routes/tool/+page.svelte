<script lang="ts">
	import P5, { type Sketch } from 'p5-svelte';

	import type p5 from 'p5';
	import MdHelpOutline from 'svelte-icons/md/MdHelpOutline.svelte';
	import MdCloudUpload from 'svelte-icons/md/MdCloudUpload.svelte';
	import MdNoteAdd from 'svelte-icons/md/MdNoteAdd.svelte';
	import MdVideocam from 'svelte-icons/md/MdVideocam.svelte';
	import MdVideocamOff from 'svelte-icons/md/MdVideocamOff.svelte';
	import MdCheck from 'svelte-icons/md/MdCheck.svelte';
	import MdSettings from 'svelte-icons/md/MdSettings.svelte';
	import MdSubject from 'svelte-icons/md/MdSubject.svelte';
	import type { User } from '../../models/user';
	import UserStore from '../../stores/userStore';
	import P5Store from '../../stores/p5Store';
	import VideoStore, { toggleVisibility as toggleVideoVisibility } from '../../stores/videoStore';
	import EditorStore from '../../stores/editorStore';

	import { Core } from '$lib/core/core';
	import { igsSketch } from '$lib/p5/igsSketch';
	import { writable, get } from 'svelte/store';
	import { onMount } from 'svelte';
	import { DataPoint } from '../../models/dataPoint';
	import { Transcript } from '../../models/transcript';
	import IconButton from '$lib/components/IconButton.svelte';
	import InfoModal from '$lib/components/InfoModal.svelte';
	import TimelinePanel from '$lib/components/TimelinePanel.svelte';
	import DataPointTable from '$lib/components/DataPointTable.svelte';
	import SplitPane from '$lib/components/SplitPane.svelte';
	import TranscriptEditor from '$lib/components/TranscriptEditor.svelte';
	import CanvasTooltip from '$lib/components/CanvasTooltip.svelte';
	import VideoContainer from '$lib/components/VideoContainer.svelte';

	import TimelineStore from '../../stores/timelineStore';
	import ConfigStore from '../../stores/configStore';
	import type { ConfigStoreType } from '../../stores/configStore';
	import TranscriptStore from '../../stores/transcriptStore';
	import { computePosition, flip, shift, offset } from '@floating-ui/dom';

	// Define ToggleKey type to fix TypeScript errors
	type ToggleKey = string;

	// Add click outside and scroll handlers for dropdowns
	onMount(() => {
		// Add global click handler to close dropdowns when clicking outside
		document.addEventListener('click', (event) => {
			const target = event.target as HTMLElement;

			// Close all dropdowns when clicking outside
			$UserStore.forEach((user, index) => {
				const dropdown = document.getElementById(`dropdown-${index}`);
				const button = document.getElementById(`btn-${index}`);

				if (dropdown && button &&
					!dropdown.contains(target) &&
					!button.contains(target) &&
					!dropdown.classList.contains('hidden')) {
					dropdown.classList.add('hidden');
				}
			});
		});

		// Add scroll handler to close dropdowns when scrolling
		const userContainer = document.querySelector('.btm-nav .overflow-x-auto');
		if (userContainer) {
			userContainer.addEventListener('scroll', () => {
				// Close all dropdowns when scrolling
				$UserStore.forEach((user, index) => {
					const dropdown = document.getElementById(`dropdown-${index}`);
					if (dropdown && !dropdown.classList.contains('hidden')) {
						dropdown.classList.add('hidden');
					}
				});
			});
		}
	});

	// Close and remove all user dropdowns when UserStore changes (e.g., when switching datasets)
	// Dropdowns are moved to document.body when opened, so we need to remove them from there
	let previousUserCount = 0;
	$: {
		const currentUserCount = $UserStore.length;
		if (currentUserCount !== previousUserCount) {
			// Remove all dropdowns that were moved to body
			document.querySelectorAll('body > [id^="dropdown-"]').forEach((dropdown) => {
				dropdown.remove();
			});
			previousUserCount = currentUserCount;
		}
	}

	const techniqueToggleOptions = ['distributionDiagramToggle', 'turnChartToggle', 'contributionCloudToggle', 'dashboardToggle'] as const;

	// Define which interactions apply to which visualizations
	const distributionDiagramInteractions = ['flowersToggle'] as const;
	const turnChartInteractions = ['separateToggle'] as const;
	const contributionCloudInteractions = ['separateToggle', 'sortToggle', 'lastWordToggle', 'echoWordsToggle', 'stopWordsToggle', 'repeatedWordsToggle'] as const;
	const allInteractions = [...new Set([...distributionDiagramInteractions, ...turnChartInteractions, ...contributionCloudInteractions])] as const;

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
		return allInteractions; // fallback
	})();

	// Check if repeated words slider should show (only for contribution cloud or dashboard)
	$: showRepeatedWordsSlider = $ConfigStore.contributionCloudToggle || $ConfigStore.dashboardToggle;

	let selectedDropDownOption = '';
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
		{ label: 'Presidential Debates', items: [{ value: 'example-5', label: 'Biden-Trump 2020 Debate' }] }
	];

	let showDataPopup = false;
	let showSettings = false;
	let showUploadModal = false;
	let isDraggingOver = false;
	let uploadedFiles: { name: string; type: string; status: 'pending' | 'processing' | 'done' | 'error'; error?: string }[] = [];
	let currentConfig: ConfigStoreType;

	let files: any = [];
	let p5Instance: p5 | null = null;
	let core: Core;
	let videoContainerRef: VideoContainer;

	// Reactive bindings to video store
	$: isVideoLoaded = $VideoStore.isLoaded;
	$: isVideoVisible = $VideoStore.isVisible;
	$: hasVideoSource = $VideoStore.source.type !== null;
	let timeline;

	ConfigStore.subscribe((value) => {
		currentConfig = value;
	});

	TimelineStore.subscribe((value) => {
		timeline = value;
	});

	
	UserStore.subscribe((data) => {
		users = data;
	});

	P5Store.subscribe((value) => {
		p5Instance = value;

		if (p5Instance) {
			core = new Core(p5Instance);
		}
	});

	const sketch: Sketch = (p5: p5) => {
		igsSketch(p5);
	};

	let isModalOpen = writable(true);

	// TODO: this deals with reactive state not updating correctly when values switch from true to false
	let prevConfig = {
		echoWordsToggle: currentConfig.echoWordsToggle,
		lastWordToggle: currentConfig.lastWordToggle,
		stopWordsToggle: currentConfig.stopWordsToggle
	};
	$: {
		const { lastWordToggle, stopWordsToggle, echoWordsToggle } = currentConfig;
		if (echoWordsToggle !== prevConfig.echoWordsToggle || lastWordToggle !== prevConfig.lastWordToggle || stopWordsToggle !== prevConfig.stopWordsToggle) {
			p5Instance?.fillSelectedData();
		}
		prevConfig = { echoWordsToggle, lastWordToggle, stopWordsToggle };
	}

	// Watch for editor layout changes (orientation, collapse) and trigger canvas resize
	let prevEditorConfig = {
		orientation: $EditorStore.config.orientation,
		isCollapsed: $EditorStore.config.isCollapsed
	};
	$: {
		const { orientation, isCollapsed } = $EditorStore.config;
		if (orientation !== prevEditorConfig.orientation || isCollapsed !== prevEditorConfig.isCollapsed) {
			// Trigger resize after DOM updates
			requestAnimationFrame(() => {
				triggerCanvasResize();
			});
		}
		prevEditorConfig = { orientation, isCollapsed };
	}

	function toggleVideo() {
		toggleVideoVisibility();
	}

	function capitalizeEachWord(sentence: string) {
		return sentence
			.split(' ')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
			.join(' ');
	}

	function formatToggleName(toggle) {
		return toggle
			.replace('Toggle', '') // Remove 'Toggle'
			.replace(/([A-Z])/g, ' $1') // Add space before capital letters
			.trim()
			.replace(/^./, (str) => str.toUpperCase()); // Capitalize first letter
	}

	function handleConfigChangeFromInput(e: Event, key: keyof ConfigStoreType) {
		const target = e.target as HTMLInputElement;
		ConfigStore.update((value) => ({
			...value,
			[key]: parseFloat(target.value)
		}));
	}

	function handleConfigChange(key: keyof ConfigStoreType, value: any) {
		ConfigStore.update((store) => ({
			...store,
			[key]: value
		}));
	}

	function toggleSelection(selection: ToggleKey, toggleOptions: ToggleKey[]) {
		ConfigStore.update((store: ConfigStoreType) => {
			const updatedStore = { ...store };
			toggleOptions.forEach((key) => {
				if (key.endsWith('Toggle')) {
					updatedStore[key] = key === selection ? !updatedStore[key] : false;
				}
			});
			return updatedStore;
		});
		p5Instance?.fillSelectedData();
	}

	function toggleSelectionOnly(selection: ToggleKey, toggleOptions: ToggleKey[]) {
		ConfigStore.update((store: ConfigStoreType) => {
			const updatedStore = { ...store };
			toggleOptions.forEach((key) => {
				if (key === selection && key.endsWith('Toggle')) {
					updatedStore[key] = !updatedStore[key];
				}
			});
			return updatedStore;
		});
	}

	function clickOutside(node) {
		const handleClick = (event) => {
			if (!node.contains(event.target)) {
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

	function updateUserLoadedFiles(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files) {
			processFiles(Array.from(input.files));
		}
		input.value = ''; // reset so same file can be selected again
	}

	async function processFiles(fileList: File[]) {
		// Add files to the upload list
		const newFiles = fileList.map(f => ({
			name: f.name,
			type: getFileTypeLabel(f.name),
			status: 'pending' as const
		}));
		uploadedFiles = [...uploadedFiles, ...newFiles];

		// Process each file
		for (let i = 0; i < fileList.length; i++) {
			const file = fileList[i];
			const fileIndex = uploadedFiles.length - fileList.length + i;

			// Update status to processing
			uploadedFiles[fileIndex].status = 'processing';
			uploadedFiles = uploadedFiles;

			try {
				await processFile(file);
				uploadedFiles[fileIndex].status = 'done';
			} catch (err) {
				uploadedFiles[fileIndex].status = 'error';
				uploadedFiles[fileIndex].error = err instanceof Error ? err.message : 'Unknown error';
			}
			uploadedFiles = uploadedFiles;
		}
	}

	async function processFile(file: File): Promise<void> {
		return new Promise((resolve, reject) => {
			const fileName = file.name.toLowerCase();
			if (fileName.endsWith('.csv') || file.type === 'text/csv') {
				core.clearTranscriptData();
				core.loadCSVData(file);
				resolve();
			} else if (fileName.endsWith('.txt')) {
				core.clearTranscriptData();
				core.loadP5Strings(URL.createObjectURL(file));
				resolve();
			} else if (fileName.endsWith('.mp4') || file.type === 'video/mp4') {
				core.prepVideoFromFile(URL.createObjectURL(file));
				resolve();
			} else {
				reject(new Error('Unsupported file format'));
			}
		});
	}

	function getFileTypeLabel(fileName: string): string {
		const ext = fileName.toLowerCase().split('.').pop();
		switch (ext) {
			case 'csv': return 'Transcript (CSV)';
			case 'txt': return 'Transcript (TXT)';
			case 'mp4': return 'Video (MP4)';
			default: return 'Unknown';
		}
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDraggingOver = false;
		if (event.dataTransfer?.files) {
			const validFiles = Array.from(event.dataTransfer.files).filter(f => {
				const name = f.name.toLowerCase();
				return name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.mp4');
			});
			if (validFiles.length > 0) {
				processFiles(validFiles);
			}
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		isDraggingOver = true;
	}

	function handleDragLeave() {
		isDraggingOver = false;
	}

	function openFileDialog() {
		const input = document.getElementById('file-input') as HTMLInputElement;
		input?.click();
	}

	function clearUploadedFiles() {
		uploadedFiles = [];
	}

	function createNewTranscript() {
		// Clear existing data
		if (p5Instance) {
			p5Instance.dynamicData?.clear();
		}

		// Clear users first
		UserStore.set([]);

		// Check if video is loaded to determine if we should use timestamps or word counts
		const videoState = get(VideoStore);
		const hasVideo = videoState.isLoaded;
		const useWordCountsAsFallback = !hasVideo;

		// Create a default speaker
		const defaultSpeaker = 'SPEAKER 1';
		const defaultColor = '#FF6B6B';

		// Set up users
		UserStore.set([{ name: defaultSpeaker, color: defaultColor, enabled: true }]);

		// Create one empty turn with placeholder text
		const startTime = hasVideo ? videoState.currentTime : 0;
		const endTime = hasVideo ? Math.max(videoState.currentTime + 1, videoState.duration) : 10;

		const initialDataPoint = new DataPoint(
			defaultSpeaker,
			0, // turnNumber
			'[new]', // placeholder word
			0, // order
			startTime,
			startTime + 1, // endTime - just 1 second/word after start
			useWordCountsAsFallback
		);

		// Create new transcript with all required stats populated
		const newTranscript = new Transcript();
		newTranscript.wordArray = [initialDataPoint];
		newTranscript.totalNumOfWords = 1;
		newTranscript.totalConversationTurns = 1;
		newTranscript.totalTimeInSeconds = hasVideo ? Math.max(videoState.duration, 1) : 10;
		newTranscript.largestTurnLength = 1;
		newTranscript.largestNumOfWordsByASpeaker = 1;
		newTranscript.largestNumOfTurnsByASpeaker = 1;
		newTranscript.maxCountOfMostRepeatedWord = 1;
		newTranscript.mostFrequentWord = '[new]';

		TranscriptStore.set(newTranscript);

		// Update timeline
		const timelineEnd = hasVideo ? Math.max(videoState.duration, 1) : 10;
		TimelineStore.update((timeline) => {
			timeline.setCurrTime(0);
			timeline.setStartTime(0);
			timeline.setEndTime(timelineEnd);
			timeline.setLeftMarker(0);
			timeline.setRightMarker(timelineEnd);
			return timeline;
		});

		// Open the editor if not already open
		EditorStore.update((state) => ({
			...state,
			config: {
				...state.config,
				isVisible: true
			}
		}));

		// Trigger canvas resize and refresh visualization after a delay
		requestAnimationFrame(() => {
			triggerCanvasResize();
			// Refresh visualization after resize
			if (p5Instance) {
				p5Instance.fillAllData?.();
			}
		});
	}

	function updateExampleDataDropDown(event) {
		core.handleExampleDropdown(event);
	}

	function handleWordSearch(event) {
		const newWord = event.target.value.trim();
		ConfigStore.update((config) => ({
			...config,
			wordToSearch: newWord
		}));
	}

	// Toggle transcript editor visibility
	function toggleEditor() {
		EditorStore.update((state) => ({
			...state,
			config: {
				...state.config,
				isVisible: !state.config.isVisible
			}
		}));
		// Trigger canvas resize after editor toggle
		// Use requestAnimationFrame to wait for DOM to update
		requestAnimationFrame(() => {
			triggerCanvasResize();
		});
	}

	// Handle split pane resize
	function handlePanelResize(event: CustomEvent<{ sizes: [number, number] }>) {
		EditorStore.update((state) => ({
			...state,
			config: {
				...state.config,
				panelSizes: event.detail.sizes
			}
		}));
		// Trigger canvas resize
		triggerCanvasResize();
	}

	// Safely trigger canvas resize only when container exists and has valid dimensions
	function triggerCanvasResize() {
		if (!p5Instance) return;
		const container = document.getElementById('p5-container');
		if (container) {
			const rect = container.getBoundingClientRect();
			// Only resize if container has valid dimensions
			if (rect.width > 0 && rect.height > 0) {
				p5Instance.windowResized?.();
			}
		}
	}
</script>

<svelte:head>
	<title>TRANSCRIPT EXPLORER</title>
</svelte:head>

<div class="page-container">
<div class="navbar min-h-16 bg-[#ffffff]">
	<div class="flex-1 px-2 lg:flex-none">
		<a class="text-2xl text-black italic" href="/">TRANSCRIPT EXPLORER</a>
	</div>

	<div class="flex justify-end flex-1 px-2 items-center gap-1">
		<!-- Visualization Controls Group -->
		<div class="flex items-center gap-2">
			<!-- Visualizations Dropdown -->
			<details class="dropdown" use:clickOutside>
				<summary class="btn btn-sm gap-1 flex items-center">
					<div class="w-4 h-4">
						<MdInsertChart />
					</div>
					<span class="hidden sm:inline">{activeVisualizationName}</span>
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

		<!-- Talk Dropdown -->
		<details class="dropdown" use:clickOutside>
			<summary class="btn btn-sm ml-4 tooltip tooltip-bottom flex items-center justify-center"> Interactions </summary>
			<ul class="menu dropdown-content rounded-box z-[1] w-52 p-2 shadow bg-base-100">
				{#each visibleInteractions as toggle}
					<li>
						<button on:click={() => toggleSelectionOnly(toggle, allInteractions)} class="w-full text-left flex items-center">
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
					<li class="cursor-none">
						<p>Repeated Word Filter: {$ConfigStore.repeatWordSliderValue}</p>
					</li>
					<li>
						<label for="repeatWordRange" class="sr-only">Adjust rect width</label>
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
				<input type="text" placeholder="Search conversations..." on:input={(e) => handleWordSearch(e)} class="input input-bordered w-full"/>
			</ul>
		</details>

		<div class="flex items-stretch">
			<IconButton
				id="btn-toggle-editor"
				icon={MdSubject}
				tooltip={'Toggle Editor'}
				on:click={toggleEditor}
			/>

			{#if isVideoVisible}
				<IconButton id="btn-toggle-video" icon={MdVideocam} tooltip={'Hide Video'} on:click={toggleVideo} disabled={!isVideoLoaded} />
			{:else}
				<IconButton id="btn-toggle-video" icon={MdVideocamOff} tooltip={'Show Video'} on:click={toggleVideo} disabled={!isVideoLoaded} />
			{/if}

			<!-- TODO: Need to move this logic into the IconButton component eventually -->
			<div
				data-tip="Upload"
				class="tooltip tooltip-bottom btn capitalize icon max-h-8 max-w-16 bg-[#ffffff] border-[#ffffff] flex items-center justify-center"
				role="button"
				tabindex="0"
				on:click
				on:keydown
			>
				<div class="w-4 h-4">
					<MdSubject />
				</div>
				<span class="hidden sm:inline">Editor</span>
			</button>
		</div>

		<!-- Divider -->
		<div class="divider divider-horizontal mx-1 h-8"></div>

		<!-- Media Controls Group -->
		<div class="flex items-center gap-1">
			{#if isVideoVisible}
				<IconButton id="btn-toggle-video" icon={MdVideocam} tooltip={'Hide Video'} on:click={toggleVideo} disabled={!isVideoLoaded} />
			{:else}
				<IconButton id="btn-toggle-video" icon={MdVideocamOff} tooltip={'Show Video'} on:click={toggleVideo} disabled={!isVideoLoaded} />
			{/if}
		</div>

		<!-- Divider -->
		<div class="divider divider-horizontal mx-1 h-8"></div>

		<!-- File & Settings Group -->
		<div class="flex items-center gap-1">
			<IconButton
				icon={MdCloudUpload}
				tooltip={'Upload Files'}
				on:click={() => (showUploadModal = true)}
			/>

			<IconButton
				icon={MdNoteAdd}
				tooltip={'Create New Transcript'}
				on:click={createNewTranscript}
			/>

			<input
				class="hidden"
				id="file-input"
				multiple
				accept=".csv, .txt, .mp4"
				type="file"
				bind:files
				on:change={updateUserLoadedFiles}
			/>

			<IconButton icon={MdHelpOutline} tooltip={'Help'} on:click={() => ($isModalOpen = !$isModalOpen)} />

			<IconButton icon={MdSettings} tooltip={'Settings'} on:click={() => (showSettings = true)} />
		</div>

		<!-- Divider -->
		<div class="divider divider-horizontal mx-1 h-8"></div>

		<!-- Example Data Dropdown -->
		<details class="dropdown dropdown-end" use:clickOutside>
			<summary class="flex justify-between items-center min-w-[180px] rounded border border-gray-300 px-3 py-1.5 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
				<span class="truncate">{selectedDropDownOption || 'Select an Example'}</span>
				<svg class="w-3 h-3 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
				</svg>
			</summary>
			<ul class="menu dropdown-content rounded-box z-[1] w-56 p-2 shadow bg-base-100 max-h-[60vh] overflow-y-auto">
				{#each dropdownOptions as group}
					<li class="menu-title text-xs uppercase tracking-wider text-gray-500 pt-2">{group.label}</li>
					{#each group.items as item}
						<li>
							<button
								on:click={() => {
									updateExampleDataDropDown({ target: { value: item.value } });
									selectedDropDownOption = item.label;
								}}
								class="text-sm {selectedDropDownOption === item.label ? 'active' : ''}"
							>
								{item.label}
							</button>
						</li>
					{/each}
				{/each}
			</ul>
		</details>
	</div>
</div>

<div class="main-content">
	<SplitPane
		orientation={$EditorStore.config.orientation}
		sizes={$EditorStore.config.panelSizes}
		collapsed={!$EditorStore.config.isVisible}
		collapsedPanel="second"
		on:resize={handlePanelResize}
	>
		<div slot="first" class="h-full relative" id="p5-container">
			<P5 {sketch} />
			<CanvasTooltip />
			{#if hasVideoSource}
				<VideoContainer bind:this={videoContainerRef} />
			{/if}
		</div>
		<div slot="second" class="h-full">
			<TranscriptEditor />
		</div>
	</SplitPane>
</div>

{#if showSettings}
	<div
		class="modal modal-open"
		on:click|self={() => (showSettings = false)}
		on:keydown={(e) => {
			if (e.key === 'Escape') showSettings = false;
		}}
	>
		<div class="modal-box w-11/12 max-w-md">
			<div class="flex justify-between mb-4">
				<h3 class="font-bold text-lg">Settings</h3>
				<button class="btn btn-circle btn-sm" on:click={() => (showSettings = false)}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="flex flex-col space-y-4">
				<!-- Animation Rate -->
				<div class="flex flex-col">
					<label for="animationRate" class="font-medium">Animation Rate: {currentConfig.animationRate}</label>
					<input
						id="animationRate"
						type="range"
						min="0.01"
						max="1"
						step="0.01"
						bind:value={currentConfig.animationRate}
						on:input={(e) => handleConfigChange('animationRate', parseFloat(e.target.value))}
						class="range range-primary"
					/>
				</div>

				<!-- Text Input for Seconds (Numeric Only) -->
				<div class="flex flex-col">
					<label for="inputSeconds" class="font-medium">End Time (seconds)</label>
					<input
						id="inputSeconds"
						type="text"
						bind:value={timeline.endTime}
						on:input={(e) => {
							let value = parseInt(e.target.value.replace(/\D/g, '')) || 0;
							TimelineStore.update((timeline) => {
								timeline.setCurrTime(0);
								timeline.setStartTime(0);
								timeline.setEndTime(value);
								timeline.setLeftMarker(0);
								timeline.setRightMarker(value);
								return timeline;
							});
						}}
						class="input input-bordered"
					/>
				</div>
			</div>

			<div class="flex flex-col mt-4">
				<button class="btn btn-sm ml-4" on:click={() => (showDataPopup = true)}>Data Explorer</button>
			</div>

			<div class="modal-action">
				<button class="btn" on:click={() => (showSettings = false)}>Close</button>
			</div>
		</div>
	</div>
{/if}

{#if showUploadModal}
	<div
		class="modal modal-open"
		on:click|self={() => (showUploadModal = false)}
		on:keydown={(e) => {
			if (e.key === 'Escape') showUploadModal = false;
		}}
	>
		<div class="modal-box w-11/12 max-w-lg">
			<div class="flex justify-between mb-4">
				<h3 class="font-bold text-lg">Upload Files</h3>
				<button class="btn btn-circle btn-sm" on:click={() => (showUploadModal = false)}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Drop zone -->
			<div
				class="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors {isDraggingOver ? 'border-primary bg-primary/10' : 'border-gray-300 hover:border-gray-400'}"
				on:drop={handleDrop}
				on:dragover={handleDragOver}
				on:dragleave={handleDragLeave}
				on:click={openFileDialog}
				on:keydown={(e) => { if (e.key === 'Enter') openFileDialog(); }}
				role="button"
				tabindex="0"
			>
				<div class="flex flex-col items-center gap-2">
					<div class="w-12 h-12 text-gray-400">
						<MdCloudUpload />
					</div>
					<p class="font-medium">Drag & drop files here</p>
					<p class="text-sm text-gray-500">or click to browse</p>
				</div>
			</div>

			<!-- Supported formats -->
			<div class="mt-4">
				<p class="text-sm font-medium mb-2">Supported formats:</p>
				<div class="flex flex-wrap gap-2">
					<span class="badge badge-outline">.csv</span>
					<span class="badge badge-outline">.txt</span>
					<span class="badge badge-outline">.mp4</span>
				</div>
				<p class="text-xs text-gray-500 mt-2">
					CSV/TXT files should contain transcript data with speaker and content columns.
					MP4 files will be used as video overlay.
				</p>
			</div>

			<!-- Uploaded files list -->
			{#if uploadedFiles.length > 0}
				<div class="mt-4">
					<div class="flex justify-between items-center mb-2">
						<p class="text-sm font-medium">Uploaded files:</p>
						<button class="btn btn-xs btn-ghost" on:click={clearUploadedFiles}>Clear</button>
					</div>
					<div class="space-y-2 max-h-40 overflow-y-auto">
						{#each uploadedFiles as file}
							<div class="flex items-center justify-between p-2 bg-base-200 rounded">
								<div class="flex items-center gap-2">
									<span class="text-sm font-medium truncate max-w-[200px]">{file.name}</span>
									<span class="badge badge-sm">{file.type}</span>
								</div>
								<div>
									{#if file.status === 'pending'}
										<span class="text-gray-400">Pending</span>
									{:else if file.status === 'processing'}
										<span class="loading loading-spinner loading-sm"></span>
									{:else if file.status === 'done'}
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success" viewBox="0 0 20 20" fill="currentColor">
											<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
										</svg>
									{:else if file.status === 'error'}
										<span class="text-error text-sm" title={file.error}>Error</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<div class="modal-action">
				<button class="btn" on:click={() => (showUploadModal = false)}>Close</button>
			</div>
		</div>
	</div>
{/if}

{#if showDataPopup}
	<div
		class="modal modal-open"
		on:click|self={() => (showDataPopup = false)}
		on:keydown={(e) => {
			if (e.key === 'Escape') showDataPopup = false;
		}}
	>
		<div class="modal-box w-11/12 max-w-5xl">
			<div class="flex justify-between">
				<div class="flex flex-col">
					<h3 class="font-bold text-lg">Data Explorer</h3>
					<p>Here you will find detailed information on the data that you have uploaded.</p>
				</div>

				<button class="btn btn-circle btn-sm" on:click={() => (showDataPopup = false)}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="overflow-x-auto">
				<div class="flex flex-col">
					<div class="flex-col my-4">
						<h4 class="font-bold my-2">Transcript Statistics:</h4>
						<div class="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
							<div>
								<p><span class="font-semibold">Total Words:</span> {$TranscriptStore.totalNumOfWords}</p>
								<p><span class="font-semibold">Total Turns:</span> {$TranscriptStore.totalConversationTurns}</p>
								<p><span class="font-semibold">Total Time:</span> {$TranscriptStore.totalTimeInSeconds.toFixed(2)}s</p>
							</div>
							<div>
								<p><span class="font-semibold">Largest Turn Length:</span> {$TranscriptStore.largestTurnLength} words</p>
								<p>
									<span class="font-semibold">Most Frequent Word:</span> "{$TranscriptStore.mostFrequentWord}" ({$TranscriptStore.maxCountOfMostRepeatedWord}
									times)
								</p>
							</div>
						</div>
					</div>

					<h4 class="font-bold">Users:</h4>
					{#each $UserStore as user}
						<div class="my-4">
							<div tabindex="0" class="text-primary-content bg-[#e6e4df] collapse" aria-controls="collapse-content-{user.name}" role="button">
								<input type="checkbox" class="peer" />
								<div class="collapse-title font-semibold flex items-center">
									<div class="w-4 h-4 rounded-full mr-2" style="background-color: {user.color}"></div>
									{capitalizeEachWord(user.name)}
								</div>

								<div class="collapse-content">
									<div class="grid grid-cols-2 gap-4 p-4">
										<div>
											<p>
												<span class="font-medium">Status:</span>
												<span class={user.enabled ? 'text-green-600' : 'text-red-600'}>
													{user.enabled ? 'Active' : 'Inactive'}
												</span>
											</p>
											<p><span class="font-medium">Color:</span> {user.color}</p>
										</div>
										<div>
											{#if $TranscriptStore.wordArray.length > 0}
												{@const userWords = $TranscriptStore.wordArray.filter((dp) => dp.speaker === user.name)}
												{@const userTurns = new Set(userWords.map((dp) => dp.turnNumber))}
												<p><span class="font-medium">Total Words:</span> {userWords.length}</p>
												<p><span class="font-medium">Total Turns:</span> {userTurns.size}</p>
											{/if}
										</div>
									</div>

									{#if $TranscriptStore.wordArray.length > 0}
										<div class="mt-4">
											<h2 class="font-medium mb-2">Recent Speech Samples:</h2>
											<div class="space-y-2">
												{#each $TranscriptStore.wordArray.filter((dp) => dp.speaker === user.name).slice(-3) as dataPoint}
													<div class="p-2 bg-white rounded">
														<p class="text-sm">"{dataPoint.word}"</p>
														<p class="text-xs text-gray-500">Time: {dataPoint.startTime.toFixed(2)}s - {dataPoint.endTime.toFixed(2)}s</p>
													</div>
												{/each}
											</div>
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
			<div class="modal-action">
				<button class="btn" on:click={() => (showDataPopup = false)}>Close</button>
			</div>
		</div>
	</div>
{/if}

<div class="btm-nav flex justify-between min-h-20" style="position: relative;">
	<div class="flex flex-1 flex-row justify-start items-center bg-[#f6f5f3] items-start px-8 overflow-x-auto"
		on:wheel={(e) => {
			if (e.deltaY !== 0) {
				e.preventDefault();
				e.currentTarget.scrollLeft += e.deltaY;
			}
		}}>
		<!-- Users Dropdowns with Floating UI -->
		{#each $UserStore as user, index}
			<div class="relative flex-shrink-0 mr-2">
				<div class="join">
					<!-- Visibility toggle button -->
					<button
						class="btn btn-sm join-item px-1"
						style="color: {user.enabled ? user.color : '#999'}; opacity: {user.enabled ? 1 : 0.5};"
						on:click={() => {
							user.enabled = !user.enabled;
							UserStore.update(u => u);
						}}
						title={user.enabled ? 'Hide speaker' : 'Show speaker'}
					>
						{#if user.enabled}
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
								<path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
								<path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd" />
							</svg>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clip-rule="evenodd" />
								<path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
							</svg>
						{/if}
					</button>
					<!-- Name button opens dropdown -->
					<button
						class="btn btn-sm join-item px-2 max-w-32 truncate"
						style="color: {user.enabled ? user.color : '#999'}; opacity: {user.enabled ? 1 : 0.5};"
						title={user.name}
						on:click={() => {
							const dropdown = document.getElementById(`dropdown-${index}`);
							if (dropdown) {
								dropdown.classList.toggle('hidden');

								// Position the dropdown using Floating UI
								const button = document.getElementById(`btn-${index}`);
								if (button && !dropdown.classList.contains('hidden')) {
									// Move dropdown to body to avoid clipping by overflow
									document.body.appendChild(dropdown);

									computePosition(button, dropdown, {
										placement: 'top',
										middleware: [
											offset(6),
											flip(),
											shift({ padding: 5 })
										]
									}).then(({x, y}) => {
										Object.assign(dropdown.style, {
											left: `${x}px`,
											top: `${y}px`,
											position: 'absolute',
											zIndex: '9999' // Higher z-index to ensure it's above canvas
										});
									});
								}
							}
						}}
						id={`btn-${index}`}
					>
						{user.name}
					</button>
				</div>

				<div
					id={`dropdown-${index}`}
					class="hidden bg-base-100 rounded-box p-2 shadow absolute"
					style="z-index: 9999;"
				>
					<ul class="w-52">
						<li class="py-2">
							<div class="flex items-center">
								<input
									type="text"
									class="input input-bordered input-sm w-full"
									value={user.name}
									on:change={(e) => {
										const oldName = user.name;
										const newName = e.currentTarget.value.trim();
										if (newName && newName !== oldName) {
											// Update all DataPoints in the transcript
											TranscriptStore.update(t => {
												t.wordArray.forEach(dp => {
													if (dp.speaker === oldName) {
														dp.speaker = newName;
													}
												});
												return t;
											});
											// Update the user name
											user.name = newName;
											UserStore.update(u => u);
											// Close the dropdown
											const dropdown = document.getElementById(`dropdown-${index}`);
											if (dropdown) {
												dropdown.classList.add('hidden');
											}
											// Refresh visualization
											const p5Instance = get(P5Store);
											if (p5Instance) {
												p5Instance.fillAllData?.();
											}
										}
									}}
									placeholder="Speaker name"
								/>
							</div>
						</li>
						<li class="py-2">
							<div class="flex items-center">
								<input
									type="color"
									class="color-picker max-w-[24px] max-h-[28px] mr-2"
									bind:value={user.color}
								/>
								<span>Color</span>
							</div>
						</li>
					</ul>
				</div>
			</div>
		{/each}
	</div>

	<!-- Right Side: Timeline -->
	<div class="flex-1 bg-[#f6f5f3]">
		<TimelinePanel />
	</div>
</div>
</div>

<slot />

<InfoModal {isModalOpen} />

<style>
	.page-container {
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
	}

	.color-picker {
		width: 30px;
		height: 30px;
		border: none;
		border-radius: 50%;
		cursor: pointer;
	}

	.main-content {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}
</style>
