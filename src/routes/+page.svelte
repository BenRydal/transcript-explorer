<script lang="ts">
	import P5, { type Sketch } from 'p5-svelte';
	import type p5 from 'p5';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { writable, get } from 'svelte/store';

	// Stores
	import UserStore from '../stores/userStore';
	import P5Store from '../stores/p5Store';
	import VideoStore, { toggleVisibility as toggleVideoVisibility, reset as resetVideo, loadVideo } from '../stores/videoStore';
	import EditorStore, { editorLayoutKey } from '../stores/editorStore';
	import TimelineStore from '../stores/timelineStore';
	import ConfigStore, { filterToggleKey } from '../stores/configStore';
	import type { ConfigStoreType } from '../stores/configStore';
	import TranscriptStore from '../stores/transcriptStore';
	import TranscribeModeStore, { toggle as toggleTranscribeMode, exit as exitTranscribeMode } from '../stores/transcribeModeStore';
	import { notifications } from '../stores/notificationStore';

	// Core utilities
	import { Core } from '$lib/core/core';
	import { igsSketch } from '$lib/p5/igsSketch';
	import { USER_COLORS } from '$lib/constants/ui';
	import { createEmptyTranscript, createTranscriptFromWhisper, createTranscriptFromParsedText, createTranscriptFromSubtitle, type TranscriptCreationResult } from '$lib/core/transcript-factory';
	import type { ParseResult } from '$lib/core/text-parser';
	import { parseSubtitleText } from '$lib/core/subtitle-parser';
	import { parseCSVRows, parseTXTLines } from '$lib/core/csv-txt-parser';
	import { testTranscript } from '$lib/core/core-utils';
	import { filterValidFiles, createUploadEntries, type UploadedFile } from '$lib/core/file-upload';
	import { getPersistedTimestamp, restoreState, clearState, saveStateDebounced, saveStateImmediate } from '$lib/core/persistence';
	import { getMaxTime, applyTimingModeToWordArray } from '$lib/core/timing-utils';
	import Papa from 'papaparse';

	// Components
	import AppNavbar from '$lib/components/AppNavbar.svelte';
	import InfoModal from '$lib/components/InfoModal.svelte';
	import TimelinePanel from '$lib/components/TimelinePanel.svelte';
	import SplitPane from '$lib/components/SplitPane.svelte';
	import TranscriptEditor from '$lib/components/TranscriptEditor.svelte';
	import CanvasTooltip from '$lib/components/CanvasTooltip.svelte';
	import VideoContainer from '$lib/components/VideoContainer.svelte';
	import TranscriptionModal from '$lib/components/TranscriptionModal.svelte';
	import SettingsModal from '$lib/components/SettingsModal.svelte';
	import UploadModal from '$lib/components/UploadModal.svelte';
	import PasteModal from '$lib/components/PasteModal.svelte';
	import DataExplorerModal from '$lib/components/DataExplorerModal.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import TourOverlay from '$lib/components/TourOverlay.svelte';
	import SpeakerControls from '$lib/components/SpeakerControls.svelte';
	import TranscribeModeLayout from '$lib/components/TranscribeModeLayout.svelte';
	import RecoveryModal from '$lib/components/RecoveryModal.svelte';
	import DashboardOverlay from '$lib/components/DashboardOverlay.svelte';

	import type { TranscriptionResult } from '$lib/core/transcription-service';

	// Modal state
	let showDataPopup = $state(false);
	let showSettings = $state(false);
	let showUploadModal = $state(false);
	let showPasteModal = $state(false);
	let showTranscriptionModal = $state(false);
	let showNewTranscriptConfirm = $state(false);
	let showRecoveryModal = $state(false);
	let recoveryTimestamp: number | null = $state(null);
	let isModalOpen = writable(true);

	// File upload state
	let isDraggingOver = $state(false);
	let uploadedFiles: UploadedFile[] = $state([]);
	let pendingVideoFile: File | null = $state(null);
	let pendingVideoDuration: number = $state(0);
	// Core references
	let p5Instance: p5 | null = $state(null);
	let core: Core;
	let tourOverlay: TourOverlay;

	// Example selection state
	let selectedDropDownOption = $state('');
	const exampleLabels: Record<string, string> = {
		'example-1': 'Kindergarten Activity',
		'example-3': '3rd Grade Discussion Odd/Even Numbers',
		'example-4': '8th Grade Science Lesson',
		'example-2': 'Family Gallery Visit',
		'example-5': 'Biden-Trump 2020 Debate'
	};

	// Reactive bindings to stores
	let isVideoLoaded = $derived($VideoStore.isLoaded);
	let isVideoVisible = $derived($VideoStore.isVisible);
	let hasVideoSource = $derived($VideoStore.source.type !== null);
	let isEditorVisible = $derived($EditorStore.config.isVisible);
	let isTranscribeModeActive = $derived($TranscribeModeStore.isActive);

	// When video loads, expand timeline to accommodate video duration (only for timed transcripts)
	let prevVideoLoaded = $state(false);
	$effect(() => {
		if (isVideoLoaded && !prevVideoLoaded && $VideoStore.duration > 0) {
			if ($TranscriptStore.timingMode !== 'untimed') {
				const videoDuration = $VideoStore.duration;
				TimelineStore.update((timeline) => {
					if (videoDuration > timeline.rightMarker) {
						timeline.endTime = videoDuration;
						timeline.rightMarker = videoDuration;
					}
					return timeline;
				});
			}
		}
		prevVideoLoaded = isVideoLoaded;
	});

	// Store subscriptions
	P5Store.subscribe((value) => {
		p5Instance = value;
		if (p5Instance) {
			core = new Core(p5Instance);
		}
	});

	// Auto-save subscriptions - save when transcript or users change
	let isRestoringState = $state(false);
	TranscriptStore.subscribe(() => {
		if (!isRestoringState) saveStateDebounced();
	});
	UserStore.subscribe(() => {
		if (!isRestoringState) saveStateDebounced();
	});

	onMount(() => {
		recoveryTimestamp = getPersistedTimestamp();
		if (recoveryTimestamp !== null) {
			showRecoveryModal = true;
		}

		window.addEventListener('beforeunload', saveStateImmediate);
		return () => window.removeEventListener('beforeunload', saveStateImmediate);
	});

	function handleRestore() {
		isRestoringState = true;
		restoreState();

		const { wordArray } = get(TranscriptStore);
		const maxTime = getMaxTime(wordArray);
		TimelineStore.update((t) => ({
			...t,
			currTime: 0,
			startTime: 0,
			endTime: maxTime,
			leftMarker: 0,
			rightMarker: maxTime,
			isAnimating: false
		}));

		requestAnimationFrame(() => {
			triggerCanvasResize();
			p5Instance?.fillAllData?.();
			isRestoringState = false;
		});
	}

	function handleDiscard() {
		clearState();
	}

	const sketch: Sketch = (p5: p5) => {
		igsSketch(p5);
	};

	// Refresh data when filter toggles change
	$effect(() => {
		$filterToggleKey;
		if (browser) p5Instance?.fillSelectedData();
	});

	// Sync visualization hover to editor selection (scroll editor to hovered turn)
	// Use get() for EditorStore to avoid reactive dependency cycle (this effect writes to EditorStore)
	$effect(() => {
		const hovered = $ConfigStore.hoveredDataPoint;
		if (hovered && get(EditorStore).config.isVisible) {
			EditorStore.update((state) => ({
				...state,
				selection: {
					...state.selection,
					selectedTurnNumber: hovered.turnNumber,
					selectionSource: 'visualization'
				}
			}));
		}
	});

	// Resize canvas when editor layout changes
	$effect(() => {
		$editorLayoutKey;
		if (browser) requestAnimationFrame(() => triggerCanvasResize());
	});

	// Resize canvas when exiting transcribe mode (fillAllData is handled by igsSketch setup)
	let prevTranscribeModeActive = $state(false);
	$effect(() => {
		if (prevTranscribeModeActive && !isTranscribeModeActive) {
			requestAnimationFrame(() => triggerCanvasResize());
		}
		prevTranscribeModeActive = isTranscribeModeActive;
	});

	// ============ Transcript Loading ============

	/**
	 * Apply a newly created transcript to all stores.
	 * Handles timing mode application, timeline reset, and canvas refresh.
	 * @param timelineEndOverride - Use when timeline should extend beyond transcript data (e.g., video duration)
	 */
	function applyTranscriptResult(
		{ transcript, users }: TranscriptCreationResult,
		timelineEndOverride?: number
	) {
		transcript.wordArray = applyTimingModeToWordArray(transcript.wordArray, transcript.timingMode);
		const maxTime = getMaxTime(transcript.wordArray);
		transcript.totalTimeInSeconds = maxTime;

		UserStore.set(users);
		TranscriptStore.set(transcript);

		const timelineEnd = timelineEndOverride ?? maxTime;
		TimelineStore.update((timeline) => ({
			...timeline,
			currTime: 0,
			startTime: 0,
			endTime: timelineEnd,
			leftMarker: 0,
			rightMarker: timelineEnd,
			isAnimating: false
		}));

		requestAnimationFrame(() => {
			triggerCanvasResize();
			p5Instance?.fillAllData?.();
		});
	}

	function openEditor() {
		EditorStore.update((state) => ({
			...state,
			config: { ...state.config, isVisible: true }
		}));
	}

	// ============ Event Handlers ============

	async function handleLoadExample(exampleId: string) {
		const example = core?.getExample(exampleId);
		if (!example || !core) return;

		try {
			clearState(); // Clear auto-save when intentionally loading new data
			core.resetVideo();

			// Load each CSV file for the example
			for (const fileName of example.files) {
				const file = await core.fetchExampleFile(exampleId, fileName);
				await processFile(file);
			}

			// Load example video
			if (example.videoId) {
				core.loadExampleVideo(example.videoId);
			}

			// Update dropdown to show selected example
			selectedDropDownOption = exampleLabels[exampleId] ?? '';
		} catch (error) {
			notifications.error('Error loading example. Please check your internet connection.');
			console.error('Example load error:', error);
		}
	}

	function handleToggleEditor() {
		EditorStore.update((state) => ({
			...state,
			config: {
				...state.config,
				isVisible: !state.config.isVisible
			}
		}));
		requestAnimationFrame(() => triggerCanvasResize());
	}

	function handleWordSearch(term: string) {
		ConfigStore.update((config) => ({
			...config,
			wordToSearch: term
		}));
	}

	function handleConfigChange(data: { key: keyof ConfigStoreType; value: number }) {
		ConfigStore.update((config) => ({
			...config,
			[data.key]: data.value
		}));
	}

	function handlePanelResize(data: { sizes: [number, number] }) {
		EditorStore.update((state) => ({
			...state,
			config: {
				...state.config,
				panelSizes: data.sizes
			}
		}));
		triggerCanvasResize();
	}

	// ============ Transcript Creation ============

	// Create a new transcript (always timed - user can switch to untimed if needed)
	function createTranscript() {
		clearState(); // Clear auto-save when intentionally creating new transcript
		core.clearTranscriptData();

		const { transcript, users } = createEmptyTranscript(USER_COLORS[0]);

		// Use video duration if loaded, otherwise default to 60 seconds
		const videoDuration = get(VideoStore).duration;
		const timelineEnd = get(VideoStore).isLoaded && videoDuration > 0 ? videoDuration : 60;

		transcript.timingMode = 'startEnd';
		transcript.totalTimeInSeconds = timelineEnd;

		UserStore.set(users);
		TranscriptStore.set(transcript);

		TimelineStore.update((t) => ({
			...t,
			currTime: 0,
			startTime: 0,
			endTime: timelineEnd,
			leftMarker: 0,
			rightMarker: timelineEnd,
			isAnimating: false
		}));

		EditorStore.update((state) => ({
			...state,
			config: { ...state.config, isVisible: true }
		}));

		requestAnimationFrame(() => {
			triggerCanvasResize();
			p5Instance?.fillAllData?.();
		});
	}

	function handleTranscriptionComplete(result: TranscriptionResult) {
		try {
			if (!result.segments || result.segments.length === 0) {
				notifications.error('Transcription produced no results. The audio may be too short or unclear.');
				return;
			}

			clearState(); // Clear auto-save when creating transcript from transcription
			core.clearTranscriptData();

			applyTranscriptResult(
				createTranscriptFromWhisper(result.segments, pendingVideoDuration, USER_COLORS[0]),
				pendingVideoDuration
			);
			openEditor();
		} catch (error) {
			notifications.error('Failed to process transcription results.');
			console.error('Transcription processing error:', error);
		} finally {
			pendingVideoFile = null;
			pendingVideoDuration = 0;
		}
	}

	function handlePasteImport(parseResult: ParseResult) {
		try {
			if (!parseResult.turns || parseResult.turns.length === 0) {
				notifications.error('No valid turns found in pasted text.');
				return;
			}

			clearState(); // Clear auto-save when importing from paste
			core.clearTranscriptData();

			applyTranscriptResult(createTranscriptFromParsedText(parseResult));
			openEditor();
		} catch (error) {
			notifications.error('Failed to import pasted transcript.');
			console.error('Paste import error:', error);
		}
	}

	// ============ File Upload ============

	function updateUserLoadedFiles(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files) {
			processFiles(Array.from(input.files));
		}
		input.value = '';
	}

	async function processFiles(fileList: File[]) {
		const newEntries = createUploadEntries(fileList);
		uploadedFiles = [...uploadedFiles, ...newEntries];

		for (let i = 0; i < fileList.length; i++) {
			const file = fileList[i];
			const fileIndex = uploadedFiles.length - fileList.length + i;

			uploadedFiles[fileIndex].status = 'processing';
			uploadedFiles = uploadedFiles;

			try {
				await processFile(file);
				uploadedFiles[fileIndex].status = 'done';
			} catch (err) {
				uploadedFiles[fileIndex].status = 'error';
				const errorMessage = err instanceof Error ? err.message : 'Unknown error';
				uploadedFiles[fileIndex].error = errorMessage;
				notifications.error(errorMessage);
			}
			uploadedFiles = uploadedFiles;
		}
	}

	function readFileAsText(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				const text = e.target?.result as string;
				if (!text) reject(new Error(`Failed to read file: ${file.name}`));
				else resolve(text);
			};
			reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
			reader.readAsText(file);
		});
	}

	function parseCSVFile(file: File): Promise<Papa.ParseResult<Record<string, unknown>>> {
		return new Promise((resolve, reject) => {
			Papa.parse(file, {
				dynamicTyping: true,
				skipEmptyLines: 'greedy',
				header: true,
				transformHeader: (h: string) => h.trim().toLowerCase(),
				complete: resolve,
				error: (error: Error) => reject(new Error(`CSV parsing error: ${error.message}`))
			});
		});
	}

	async function processFile(file: File): Promise<void> {
		const fileName = file.name.toLowerCase();

		if (fileName.endsWith('.csv') || file.type === 'text/csv') {
			const results = await parseCSVFile(file);
			if (!testTranscript(results)) {
				throw new Error('Invalid CSV format. Required columns: "speaker" and "content".');
			}
			const speechRate = get(ConfigStore).speechRateWordsPerSecond;
			const parseResult = parseCSVRows(results.data, speechRate);
			if (parseResult.turns.length === 0) {
				throw new Error('No valid turns found in CSV. Check that rows have speaker and content values.');
			}
			clearState();
			core.clearTranscriptData();
			applyTranscriptResult(createTranscriptFromParsedText(parseResult, parseResult.detectedTimingMode));
		} else if (fileName.endsWith('.txt')) {
			const text = await readFileAsText(file);
			const parseResult = parseTXTLines(text.split(/\r?\n/));
			if (parseResult.turns.length === 0) {
				throw new Error('No valid turns found in text file. Expected format: "Speaker: content"');
			}
			clearState();
			core.clearTranscriptData();
			applyTranscriptResult(createTranscriptFromParsedText(parseResult));
		} else if (fileName.endsWith('.mp4') || file.type === 'video/mp4') {
			pendingVideoFile = file;
			core.prepVideoFromFile(URL.createObjectURL(file));
			setTimeout(() => {
				pendingVideoDuration = get(VideoStore).duration || 0;
			}, 1000);
		} else if (fileName.endsWith('.srt') || fileName.endsWith('.vtt')) {
			const text = await readFileAsText(file);
			const parseResult = parseSubtitleText(text);
			if (parseResult.turns.length === 0) {
				throw new Error('No valid subtitles found in file. Check the file format.');
			}
			clearState();
			core.clearTranscriptData();
			applyTranscriptResult(createTranscriptFromSubtitle(parseResult, USER_COLORS[0]));
		} else {
			throw new Error('Unsupported file format');
		}
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDraggingOver = false;
		if (event.dataTransfer?.files) {
			const validFiles = filterValidFiles(Array.from(event.dataTransfer.files));
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

	// ============ Canvas Resize ============

	function triggerCanvasResize() {
		if (!p5Instance) return;
		const container = document.getElementById('p5-container');
		if (container) {
			const rect = container.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) {
				p5Instance.windowResized?.();
			}
		}
	}
</script>

<svelte:head>
	<title>Transcript Explorer</title>
</svelte:head>

{#if isTranscribeModeActive}
	<TranscribeModeLayout onexit={exitTranscribeMode} oncreateTranscript={createTranscript} />
{:else}
	<div class="page-container">
		<AppNavbar
			selectedExample={selectedDropDownOption}
			{isEditorVisible}
			{isVideoVisible}
			{isVideoLoaded}
			onloadExample={handleLoadExample}
			ontoggleEditor={handleToggleEditor}
			ontoggleVideo={toggleVideoVisibility}
			onopenUpload={() => (showUploadModal = true)}
			onopenHelp={() => ($isModalOpen = !$isModalOpen)}
			onopenSettings={() => (showSettings = true)}
			oncreateNewTranscript={() => (showNewTranscriptConfirm = true)}
			ontoggleTranscribeMode={toggleTranscribeMode}
			onwordSearch={handleWordSearch}
			onconfigChange={handleConfigChange}
		/>

		<div class="main-content">
			<SplitPane
				orientation={$EditorStore.config.orientation}
				sizes={$EditorStore.config.panelSizes}
				collapsed={!$EditorStore.config.isVisible}
				collapsedPanel="second"
				onresize={handlePanelResize}
			>
				{#snippet first()}
					<div class="h-full relative" id="p5-container" data-tour="visualization">
						<P5 {sketch} />
						<CanvasTooltip />
						{#if $ConfigStore.dashboardToggle}
							<DashboardOverlay />
						{/if}
						{#if $ConfigStore.cloudOverflowBounds && ($ConfigStore.contributionCloudToggle || $ConfigStore.dashboardToggle)}
							{@const b = $ConfigStore.cloudOverflowBounds}
							<div class="badge badge-neutral absolute" style="left: {b.x + b.width - 12}px; top: {b.y + b.height - 12}px; transform: translate(-100%, -100%);">Some content not shown</div>
						{/if}
						{#if hasVideoSource}
							<VideoContainer />
						{/if}
					</div>
				{/snippet}
				{#snippet second()}
					<div class="h-full">
						<TranscriptEditor oncreateTranscript={createTranscript} />
					</div>
				{/snippet}
			</SplitPane>
		</div>

		<SettingsModal bind:isOpen={showSettings} onopenDataExplorer={() => (showDataPopup = true)} />

		<UploadModal
			bind:isOpen={showUploadModal}
			{isDraggingOver}
			{pendingVideoFile}
			{uploadedFiles}
			ondrop={handleDrop}
			ondragover={handleDragOver}
			ondragleave={handleDragLeave}
			onopenFileDialog={openFileDialog}
			onclearFiles={clearUploadedFiles}
			onstartTranscription={() => (showTranscriptionModal = true)}
			onyoutubeUrl={(videoId) => loadVideo({ type: 'youtube', videoId })}
			onopenPasteModal={() => {
				showUploadModal = false;
				showPasteModal = true;
			}}
		/>

		<PasteModal bind:isOpen={showPasteModal} onimport={handlePasteImport} />

		<DataExplorerModal bind:isOpen={showDataPopup} />

		<ConfirmModal
			bind:isOpen={showNewTranscriptConfirm}
			title="Create New Transcript?"
			message="This will erase the current transcript. This action cannot be undone."
			confirmText="Erase and Create New"
			onconfirm={createTranscript}
		/>

		<div class="btm-nav flex justify-between min-h-20" style="position: relative;">
			<SpeakerControls />
			<div class="flex-1 bg-[#f6f5f3]" data-tour="timeline">
				<TimelinePanel />
			</div>
		</div>
	</div>
{/if}

<input class="hidden" id="file-input" multiple accept=".csv, .txt, .mp4, .srt, .vtt" type="file" onchange={updateUserLoadedFiles} />

<InfoModal
	{isModalOpen}
	onLoadExample={(id) => handleLoadExample(id)}
	onOpenUpload={() => (showUploadModal = true)}
	onOpenPaste={() => (showPasteModal = true)}
	onStartTour={() => tourOverlay.start()}
/>

<TranscriptionModal
	bind:isOpen={showTranscriptionModal}
	videoFile={pendingVideoFile}
	videoDuration={pendingVideoDuration}
	oncomplete={handleTranscriptionComplete}
	onclose={() => (showTranscriptionModal = false)}
/>

<TourOverlay bind:this={tourOverlay} />

<RecoveryModal bind:isOpen={showRecoveryModal} savedAt={recoveryTimestamp} onrestore={handleRestore} ondiscard={handleDiscard} />

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
