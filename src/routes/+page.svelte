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
	import MdInsertChart from 'svelte-icons/md/MdInsertChart.svelte';
	import MdTouchApp from 'svelte-icons/md/MdTouchApp.svelte';
	import MdMenu from 'svelte-icons/md/MdMenu.svelte';
	import MdClose from 'svelte-icons/md/MdClose.svelte';
	import UserStore from '../stores/userStore';
	import P5Store from '../stores/p5Store';
	import VideoStore, { toggleVisibility as toggleVideoVisibility, reset as resetVideo } from '../stores/videoStore';
	import EditorStore, { editorLayoutKey } from '../stores/editorStore';

	import { browser } from '$app/environment';
	import { Core } from '$lib/core/core';
	import { igsSketch } from '$lib/p5/igsSketch';
	import { writable, get } from 'svelte/store';
	import { DataPoint } from '../models/dataPoint';
	import { Transcript } from '../models/transcript';
	import { USER_COLORS } from '$lib/constants/ui';
	import IconButton from '$lib/components/IconButton.svelte';
	import InfoModal from '$lib/components/InfoModal.svelte';
	import TimelinePanel from '$lib/components/TimelinePanel.svelte';
	import SplitPane from '$lib/components/SplitPane.svelte';
	import TranscriptEditor from '$lib/components/TranscriptEditor.svelte';
	import CanvasTooltip from '$lib/components/CanvasTooltip.svelte';
	import VideoContainer from '$lib/components/VideoContainer.svelte';
	import TranscriptionModal from '$lib/components/TranscriptionModal.svelte';
	import SettingsModal from '$lib/components/SettingsModal.svelte';
	import UploadModal from '$lib/components/UploadModal.svelte';
	import DataExplorerModal from '$lib/components/DataExplorerModal.svelte';
	import TourOverlay from '$lib/components/TourOverlay.svelte';
	import SpeakerControls from '$lib/components/SpeakerControls.svelte';
	import type { TranscriptionResult } from '$lib/core/transcription-service';

	import TimelineStore from '../stores/timelineStore';
	import ConfigStore, { filterToggleKey } from '../stores/configStore';
	import type { ConfigStoreType } from '../stores/configStore';
	import TranscriptStore from '../stores/transcriptStore';

	// Define ToggleKey type to fix TypeScript errors
	type ToggleKey = string;

	const techniqueToggleOptions = ['distributionDiagramToggle', 'turnChartToggle', 'contributionCloudToggle', 'dashboardToggle'] as const;

	// Define which interactions apply to which visualizations
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
	let mobileMenuOpen = false;
	let showTranscriptionModal = false;
	let showNewTranscriptConfirm = false;
	let isDraggingOver = false;
	let uploadedFiles: { name: string; type: string; status: 'pending' | 'processing' | 'done' | 'error'; error?: string }[] = [];
	let currentConfig: ConfigStoreType;
	let pendingVideoFile: File | null = null;
	let pendingVideoDuration: number = 0;

	let files: any = [];
	let p5Instance: p5 | null = null;
	let core: Core;
	let videoContainerRef: VideoContainer;

	// Reactive bindings to video store
	$: isVideoLoaded = $VideoStore.isLoaded;
	$: isVideoVisible = $VideoStore.isVisible;
	$: hasVideoSource = $VideoStore.source.type !== null;

	// When video loads, expand timeline to accommodate video duration (only for timed transcripts)
	let prevVideoLoaded = false;
	$: {
		if (isVideoLoaded && !prevVideoLoaded && $VideoStore.duration > 0) {
			// Only expand timeline if transcript has real timestamps (not word-count mode)
			if ($TranscriptStore.timingMode !== 'untimed') {
				const videoDuration = $VideoStore.duration;
				TimelineStore.update((timeline) => {
					// Only expand, never shrink
					if (videoDuration > timeline.rightMarker) {
						timeline.endTime = videoDuration;
						timeline.rightMarker = videoDuration;
					}
					return timeline;
				});
			}
		}
		prevVideoLoaded = isVideoLoaded;
	}

	// Reactive binding for editor visibility
	$: isEditorVisible = $EditorStore.config.isVisible;

	// Get currently active visualization name
	$: activeVisualization = techniqueToggleOptions.find((t) => $ConfigStore[t]) || '';
	$: activeVisualizationName = activeVisualization ? formatToggleName(activeVisualization) : 'Select';

	ConfigStore.subscribe((value) => {
		currentConfig = value;
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

	// Refresh data when filter toggles change
	$: $filterToggleKey, browser && p5Instance?.fillSelectedData();

	// Resize canvas when editor layout changes
	$: $editorLayoutKey, browser && requestAnimationFrame(() => triggerCanvasResize());

	function toggleVideo() {
		toggleVideoVisibility();
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
		const newFiles = fileList.map((f) => ({
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
				core.loadCSVData(file);
				resolve();
			} else if (fileName.endsWith('.txt')) {
				core.loadP5Strings(URL.createObjectURL(file));
				resolve();
			} else if (fileName.endsWith('.mp4') || file.type === 'video/mp4') {
				// Store video file for potential transcription
				pendingVideoFile = file;
				core.prepVideoFromFile(URL.createObjectURL(file));
				// Get video duration after a short delay to let video load
				setTimeout(() => {
					pendingVideoDuration = get(VideoStore).duration || 0;
				}, 1000);
				resolve();
			} else {
				reject(new Error('Unsupported file format'));
			}
		});
	}

	function getFileTypeLabel(fileName: string): string {
		const ext = fileName.toLowerCase().split('.').pop();
		switch (ext) {
			case 'csv':
				return 'Transcript (CSV)';
			case 'txt':
				return 'Transcript (TXT)';
			case 'mp4':
				return 'Video (MP4)';
			default:
				return 'Unknown';
		}
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDraggingOver = false;
		if (event.dataTransfer?.files) {
			const validFiles = Array.from(event.dataTransfer.files).filter((f) => {
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

	function confirmNewTranscript() {
		showNewTranscriptConfirm = false;
		resetVideo();
		core.clearTranscriptData();

		UserStore.set([{ name: 'SPEAKER 1', color: USER_COLORS[0], enabled: true }]);

		TranscriptStore.update((t) => ({
			...t,
			wordArray: [new DataPoint('SPEAKER 1', 0, '[new]', 0, 1)],
			totalNumOfWords: 1,
			totalConversationTurns: 1,
			totalTimeInSeconds: 1,
			largestTurnLength: 1,
			largestNumOfWordsByASpeaker: 1,
			largestNumOfTurnsByASpeaker: 1,
			maxCountOfMostRepeatedWord: 1,
			mostFrequentWord: '[new]'
		}));

		TimelineStore.update((t) => ({
			...t,
			currTime: 0,
			startTime: 0,
			endTime: 1,
			leftMarker: 0,
			rightMarker: 1,
			isAnimating: false
		}));

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

	function handleTranscriptionComplete(event: CustomEvent<TranscriptionResult>) {
		const result = event.detail;

		// Clear existing transcript data (includes history)
		core.clearTranscriptData();

		// Set up single speaker (Whisper doesn't do speaker diarization)
		const defaultSpeaker = 'SPEAKER 1';
		UserStore.set([{ name: defaultSpeaker, color: USER_COLORS[0], enabled: true }]);

		// Convert transcription segments to DataPoints
		const wordArray: DataPoint[] = [];
		const turnLengths = new Map<number, number>();
		const wordCounts = new Map<string, number>();

		result.segments.forEach((segment, turnIndex) => {
			const words = segment.text.split(/\s+/).filter((w) => w.trim());
			const wordDuration = words.length > 0 ? (segment.end - segment.start) / words.length : 0;
			turnLengths.set(turnIndex, words.length);

			words.forEach((word, wordIndex) => {
				const wordStart = segment.start + wordIndex * wordDuration;
				const wordEnd = segment.start + (wordIndex + 1) * wordDuration;
				wordArray.push(new DataPoint(defaultSpeaker, turnIndex, word, wordStart, wordEnd));
				const lowerWord = word.toLowerCase();
				wordCounts.set(lowerWord, (wordCounts.get(lowerWord) || 0) + 1);
			});
		});

		// Find most frequent word
		let maxWordCount = 0;
		let mostFrequentWord = '';
		wordCounts.forEach((count, word) => {
			if (count > maxWordCount) {
				maxWordCount = count;
				mostFrequentWord = word;
			}
		});

		// Create transcript
		const maxTime = wordArray.length > 0 ? wordArray[wordArray.length - 1].endTime : 0;
		const newTranscript = new Transcript();
		newTranscript.wordArray = wordArray;
		newTranscript.timingMode = 'startEnd';
		newTranscript.totalNumOfWords = wordArray.length;
		newTranscript.totalConversationTurns = result.segments.length;
		newTranscript.totalTimeInSeconds = pendingVideoDuration || maxTime;
		newTranscript.largestTurnLength = Math.max(...turnLengths.values(), 1);
		newTranscript.largestNumOfWordsByASpeaker = wordArray.length;
		newTranscript.largestNumOfTurnsByASpeaker = result.segments.length;
		newTranscript.maxCountOfMostRepeatedWord = maxWordCount;
		newTranscript.mostFrequentWord = mostFrequentWord;

		TranscriptStore.set(newTranscript);

		// Update timeline
		const timelineEnd = pendingVideoDuration || maxTime;
		TimelineStore.update((timeline) => {
			timeline.currTime = 0;
			timeline.startTime = 0;
			timeline.endTime = timelineEnd;
			timeline.leftMarker = 0;
			timeline.rightMarker = timelineEnd;
			return timeline;
		});

		// Open the editor
		EditorStore.update((state) => ({
			...state,
			config: { ...state.config, isVisible: true }
		}));

		// Refresh visualization
		requestAnimationFrame(() => {
			triggerCanvasResize();
			if (p5Instance) {
				p5Instance.fillAllData?.();
			}
		});

		// Clear pending video file
		pendingVideoFile = null;
		pendingVideoDuration = 0;
	}

	function loadExample(exampleId: string) {
		core?.loadExample(exampleId);
		// Update dropdown to show selected example
		for (const group of dropdownOptions) {
			const item = group.items.find((i) => i.value === exampleId);
			if (item) {
				selectedDropDownOption = item.label;
				break;
			}
		}
	}

	let tourOverlay: TourOverlay;

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
	<title>Transcript Explorer</title>
</svelte:head>

<div class="page-container">
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
								<button on:click={() => loadExample(item.value)} class="text-sm {selectedDropDownOption === item.label ? 'active' : ''}">
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
							<input type="text" placeholder="Search conversations..." on:input={(e) => handleWordSearch(e)} class="input input-bordered w-full" />
						</ul>
					</details>

					<!-- Editor Toggle -->
					<button
						class="btn btn-sm gap-1 {isEditorVisible ? 'btn-primary' : ''}"
						on:click={toggleEditor}
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
					on:click={toggleVideo}
					disabled={!isVideoLoaded}
				/>
			</div>

			<!-- Divider -->
			<div class="divider divider-horizontal mx-1 h-8"></div>

			<!-- File & Settings Group -->
			<div class="flex items-center gap-1">
				<IconButton icon={MdCloudUpload} tooltip={'Upload Files'} on:click={() => (showUploadModal = true)} />
				<IconButton icon={MdNoteAdd} tooltip={'Create New Transcript'} on:click={() => (showNewTranscriptConfirm = true)} />
				<input class="hidden" id="file-input" multiple accept=".csv, .txt, .mp4" type="file" bind:files on:change={updateUserLoadedFiles} />
				<IconButton icon={MdHelpOutline} tooltip={'Help'} on:click={() => ($isModalOpen = !$isModalOpen)} />
				<IconButton icon={MdSettings} tooltip={'Settings'} on:click={() => (showSettings = true)} />
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
						<option value="" disabled selected={!selectedDropDownOption}>Select an Example</option>
						{#each dropdownOptions as group}
							<optgroup label={group.label}>
								{#each group.items as item}
									<option value={item.value} selected={selectedDropDownOption === item.label}>{item.label}</option>
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
							<button
								class="btn btn-sm {$ConfigStore[toggle] ? 'btn-primary' : 'btn-ghost'}"
								on:click={() => toggleSelectionOnly(toggle, allInteractions)}
							>
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
					<input
						type="text"
						placeholder="Search conversations..."
						on:input={(e) => handleWordSearch(e)}
						class="input input-bordered input-sm w-full mt-2"
					/>
				</div>

				<!-- Quick Actions -->
				<div>
					<p class="text-xs uppercase tracking-wider text-gray-500 mb-2">Actions</p>
					<div class="flex flex-wrap gap-2">
						<button
							class="btn btn-sm {isEditorVisible ? 'btn-primary' : 'btn-ghost'}"
							on:click={() => {
								toggleEditor();
								mobileMenuOpen = false;
							}}
						>
							<div class="w-4 h-4 mr-1"><MdSubject /></div>
							Editor
						</button>
						<button
							class="btn btn-sm btn-ghost"
							on:click={() => {
								toggleVideo();
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
							class="btn btn-sm btn-ghost"
							on:click={() => {
								showUploadModal = true;
								mobileMenuOpen = false;
							}}
						>
							<div class="w-4 h-4 mr-1"><MdCloudUpload /></div>
							Upload
						</button>
						<button
							class="btn btn-sm btn-ghost"
							on:click={() => {
								showNewTranscriptConfirm = true;
								mobileMenuOpen = false;
							}}
						>
							<div class="w-4 h-4 mr-1"><MdNoteAdd /></div>
							New
						</button>
						<button
							class="btn btn-sm btn-ghost"
							on:click={() => {
								$isModalOpen = true;
								mobileMenuOpen = false;
							}}
						>
							<div class="w-4 h-4 mr-1"><MdHelpOutline /></div>
							Help
						</button>
						<button
							class="btn btn-sm btn-ghost"
							on:click={() => {
								showSettings = true;
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

	<div class="main-content">
		<SplitPane
			orientation={$EditorStore.config.orientation}
			sizes={$EditorStore.config.panelSizes}
			collapsed={!$EditorStore.config.isVisible}
			collapsedPanel="second"
			on:resize={handlePanelResize}
		>
			<div slot="first" class="h-full relative" id="p5-container" data-tour="visualization">
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

	<SettingsModal bind:isOpen={showSettings} on:openDataExplorer={() => (showDataPopup = true)} />

	<UploadModal
		bind:isOpen={showUploadModal}
		{isDraggingOver}
		{pendingVideoFile}
		{uploadedFiles}
		on:drop={(e) => handleDrop(e.detail)}
		on:dragover={(e) => handleDragOver(e.detail)}
		on:dragleave={handleDragLeave}
		on:openFileDialog={openFileDialog}
		on:clearFiles={clearUploadedFiles}
		on:startTranscription={() => (showTranscriptionModal = true)}
	/>

	<DataExplorerModal bind:isOpen={showDataPopup} />

	<!-- New Transcript Confirmation Dialog -->
	{#if showNewTranscriptConfirm}
		<div class="modal modal-open">
			<div class="modal-box">
				<h3 class="font-bold text-lg">Create New Transcript?</h3>
				<p class="py-4">This will erase all current data including transcript and video. This action cannot be undone.</p>
				<div class="modal-action">
					<button class="btn btn-ghost" on:click={() => (showNewTranscriptConfirm = false)}>Cancel</button>
					<button class="btn btn-error" on:click={confirmNewTranscript}>Erase and Create New</button>
				</div>
			</div>
			<div class="modal-backdrop" on:click={() => (showNewTranscriptConfirm = false)} on:keydown={() => {}}></div>
		</div>
	{/if}

	<div class="btm-nav flex justify-between min-h-20" style="position: relative;">
		<SpeakerControls />
		<div class="flex-1 bg-[#f6f5f3]" data-tour="timeline">
			<TimelinePanel />
		</div>
	</div>
</div>

<slot />

<InfoModal {isModalOpen} onLoadExample={loadExample} onOpenUpload={() => (showUploadModal = true)} onStartTour={() => tourOverlay.start()} />

<TranscriptionModal
	bind:isOpen={showTranscriptionModal}
	videoFile={pendingVideoFile}
	videoDuration={pendingVideoDuration}
	on:complete={handleTranscriptionComplete}
	on:close={() => (showTranscriptionModal = false)}
/>

<TourOverlay bind:this={tourOverlay} />

<style>
	.page-container {
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
	}

	.main-content {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}
</style>
