<script lang="ts">
	import P5, { type Sketch } from 'p5-svelte';
	import type p5 from 'p5';
	import { browser } from '$app/environment';
	import { writable, get } from 'svelte/store';

	// Stores
	import UserStore from '../stores/userStore';
	import P5Store from '../stores/p5Store';
	import VideoStore, { toggleVisibility as toggleVideoVisibility, reset as resetVideo } from '../stores/videoStore';
	import EditorStore, { editorLayoutKey } from '../stores/editorStore';
	import TimelineStore from '../stores/timelineStore';
	import ConfigStore, { filterToggleKey } from '../stores/configStore';
	import type { ConfigStoreType } from '../stores/configStore';
	import TranscriptStore from '../stores/transcriptStore';

	// Core utilities
	import { Core } from '$lib/core/core';
	import { igsSketch } from '$lib/p5/igsSketch';
	import { USER_COLORS } from '$lib/constants/ui';
	import { createEmptyTranscript, createTranscriptFromWhisper } from '$lib/core/transcript-factory';
	import { filterValidFiles, createUploadEntries, type UploadedFile } from '$lib/core/file-upload';

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
	import DataExplorerModal from '$lib/components/DataExplorerModal.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import TourOverlay from '$lib/components/TourOverlay.svelte';
	import SpeakerControls from '$lib/components/SpeakerControls.svelte';

	import type { TranscriptionResult } from '$lib/core/transcription-service';

	// Modal state
	let showDataPopup = false;
	let showSettings = false;
	let showUploadModal = false;
	let showTranscriptionModal = false;
	let showNewTranscriptConfirm = false;
	let isModalOpen = writable(true);

	// File upload state
	let isDraggingOver = false;
	let uploadedFiles: UploadedFile[] = [];
	let pendingVideoFile: File | null = null;
	let pendingVideoDuration: number = 0;
	let files: FileList | undefined;

	// Core references
	let p5Instance: p5 | null = null;
	let core: Core;
	let tourOverlay: TourOverlay;

	// Example selection state
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

	// Reactive bindings to stores
	$: isVideoLoaded = $VideoStore.isLoaded;
	$: isVideoVisible = $VideoStore.isVisible;
	$: hasVideoSource = $VideoStore.source.type !== null;
	$: isEditorVisible = $EditorStore.config.isVisible;

	// When video loads, expand timeline to accommodate video duration (only for timed transcripts)
	let prevVideoLoaded = false;
	$: {
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
	}

	// Store subscriptions
	P5Store.subscribe((value) => {
		p5Instance = value;
		if (p5Instance) {
			core = new Core(p5Instance);
		}
	});

	const sketch: Sketch = (p5: p5) => {
		igsSketch(p5);
	};

	// Refresh data when filter toggles change
	$: $filterToggleKey, browser && p5Instance?.fillSelectedData();

	// Resize canvas when editor layout changes
	$: $editorLayoutKey, browser && requestAnimationFrame(() => triggerCanvasResize());

	// ============ Event Handlers ============

	function handleLoadExample(event: CustomEvent<string>) {
		const exampleId = event.detail;
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

	function handleWordSearch(event: CustomEvent<string>) {
		ConfigStore.update((config) => ({
			...config,
			wordToSearch: event.detail
		}));
	}

	function handleConfigChange(event: CustomEvent<{ key: keyof ConfigStoreType; value: number }>) {
		ConfigStore.update((config) => ({
			...config,
			[event.detail.key]: event.detail.value
		}));
	}

	function handlePanelResize(event: CustomEvent<{ sizes: [number, number] }>) {
		EditorStore.update((state) => ({
			...state,
			config: {
				...state.config,
				panelSizes: event.detail.sizes
			}
		}));
		triggerCanvasResize();
	}

	// ============ Transcript Creation ============

	function confirmNewTranscript() {
		resetVideo();
		core.clearTranscriptData();

		const { transcript, users } = createEmptyTranscript(USER_COLORS[0]);
		UserStore.set(users);
		TranscriptStore.set(transcript);

		TimelineStore.update((t) => ({
			...t,
			currTime: 0,
			startTime: 0,
			endTime: 1,
			leftMarker: 0,
			rightMarker: 1,
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

	function handleTranscriptionComplete(event: CustomEvent<TranscriptionResult>) {
		const result = event.detail;
		core.clearTranscriptData();

		const { transcript, users } = createTranscriptFromWhisper(result.segments, pendingVideoDuration, USER_COLORS[0]);
		UserStore.set(users);
		TranscriptStore.set(transcript);

		const timelineEnd = pendingVideoDuration || transcript.totalTimeInSeconds;
		TimelineStore.update((timeline) => ({
			...timeline,
			currTime: 0,
			startTime: 0,
			endTime: timelineEnd,
			leftMarker: 0,
			rightMarker: timelineEnd
		}));

		EditorStore.update((state) => ({
			...state,
			config: { ...state.config, isVisible: true }
		}));

		requestAnimationFrame(() => {
			triggerCanvasResize();
			p5Instance?.fillAllData?.();
		});

		pendingVideoFile = null;
		pendingVideoDuration = 0;
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
				pendingVideoFile = file;
				core.prepVideoFromFile(URL.createObjectURL(file));
				setTimeout(() => {
					pendingVideoDuration = get(VideoStore).duration || 0;
				}, 1000);
				resolve();
			} else {
				reject(new Error('Unsupported file format'));
			}
		});
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

<div class="page-container">
	<AppNavbar
		selectedExample={selectedDropDownOption}
		{isEditorVisible}
		{isVideoVisible}
		{isVideoLoaded}
		on:loadExample={handleLoadExample}
		on:toggleEditor={handleToggleEditor}
		on:toggleVideo={toggleVideoVisibility}
		on:openUpload={() => (showUploadModal = true)}
		on:openHelp={() => ($isModalOpen = !$isModalOpen)}
		on:openSettings={() => (showSettings = true)}
		on:createNewTranscript={() => (showNewTranscriptConfirm = true)}
		on:wordSearch={handleWordSearch}
		on:configChange={handleConfigChange}
	/>

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
				{#if $ConfigStore.cloudHasOverflow && ($ConfigStore.contributionCloudToggle || $ConfigStore.dashboardToggle)}
					<div class="badge badge-neutral absolute bottom-3 right-3">Some content not shown</div>
				{/if}
				{#if hasVideoSource}
					<VideoContainer />
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

	<ConfirmModal
		bind:isOpen={showNewTranscriptConfirm}
		title="Create New Transcript?"
		message="This will erase all current data including transcript and video. This action cannot be undone."
		confirmText="Erase and Create New"
		on:confirm={confirmNewTranscript}
	/>

	<div class="btm-nav flex justify-between min-h-20" style="position: relative;">
		<SpeakerControls />
		<div class="flex-1 bg-[#f6f5f3]" data-tour="timeline">
			<TimelinePanel />
		</div>
	</div>
</div>

<slot />

<input class="hidden" id="file-input" multiple accept=".csv, .txt, .mp4" type="file" bind:files on:change={updateUserLoadedFiles} />

<InfoModal
	{isModalOpen}
	onLoadExample={(id) => handleLoadExample(new CustomEvent('loadExample', { detail: id }))}
	onOpenUpload={() => (showUploadModal = true)}
	onStartTour={() => tourOverlay.start()}
/>

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
