<script lang="ts">
	import MdSwapVert from 'svelte-icons/md/MdSwapVert.svelte';
	import MdSwapHoriz from 'svelte-icons/md/MdSwapHoriz.svelte';
	import MdFileDownload from 'svelte-icons/md/MdFileDownload.svelte';
	import MdVideoLibrary from 'svelte-icons/md/MdVideoLibrary.svelte';
	import { get } from 'svelte/store';
	import EditorStore from '../../stores/editorStore';
	import TranscriptStore from '../../stores/transcriptStore';
	import P5Store from '../../stores/p5Store';
	import { exportTranscriptToCSV } from '$lib/core/export-utils';
	import { applyTimingModeToWordArray, updateTimelineFromData } from '$lib/core/timing-utils';
	import type { TimingMode } from '../../models/transcript';

	function toggleOrientation() {
		EditorStore.update((state) => ({
			...state,
			config: {
				...state.config,
				orientation: state.config.orientation === 'vertical' ? 'horizontal' : 'vertical'
			}
		}));
	}

	function toggleAdvancedVideoControls() {
		EditorStore.update((state) => ({
			...state,
			config: {
				...state.config,
				showAdvancedVideoControls: !state.config.showAdvancedVideoControls
			}
		}));
	}

	function setTimingMode(mode: TimingMode) {
		const currentMode = get(TranscriptStore).timingMode;
		if (mode === currentMode) return;

		// Confirm before changing timing mode (only warn if data loss)
		let message: string | null = null;
		if (mode === 'untimed') {
			message = 'Switch to untimed mode? This will remove all timestamps.';
		} else if (mode === 'startOnly' && currentMode === 'startEnd') {
			message = 'Switch to start-only mode? End times will be removed.';
		}
		if (message && !confirm(message)) return;

		TranscriptStore.update((transcript) => {
			const updatedWordArray = applyTimingModeToWordArray(transcript.wordArray, mode);
			return {
				...transcript,
				wordArray: updatedWordArray,
				timingMode: mode
			};
		});

		// Update timeline to match data range (don't expand-only, set to actual range)
		const updatedTranscript = get(TranscriptStore);
		updateTimelineFromData(updatedTranscript.wordArray, false);

		// Mark as dirty
		EditorStore.update((state) => ({
			...state,
			isDirty: true
		}));

		// Refresh visualization
		const p5Instance = get(P5Store);
		if (p5Instance) {
			p5Instance.fillAllData?.();
		}
	}

	function handleExport() {
		exportTranscriptToCSV();
	}

	$: isVertical = $EditorStore.config.orientation === 'vertical';
	$: showAdvancedVideoControls = $EditorStore.config.showAdvancedVideoControls;
	$: timingMode = $TranscriptStore.timingMode;
	$: hasTranscript = $TranscriptStore.wordArray.length > 0;
</script>

<div class="editor-toolbar">
	<div class="toolbar-left">
		<span class="toolbar-title">Transcript</span>
		{#if $EditorStore.isDirty}
			<span class="dirty-indicator" title="Unsaved changes">*</span>
		{/if}
	</div>

	<div class="toolbar-right">
		{#if hasTranscript}
			<div class="timing-mode-group">
				<button
					class="timing-mode-btn"
					class:active={timingMode === 'untimed'}
					on:click={() => setTimingMode('untimed')}
					title="No timestamps"
				>
					Untimed
				</button>
				<button
					class="timing-mode-btn"
					class:active={timingMode === 'startOnly'}
					on:click={() => setTimingMode('startOnly')}
					title="Start times only"
				>
					Start
				</button>
				<button
					class="timing-mode-btn"
					class:active={timingMode === 'startEnd'}
					on:click={() => setTimingMode('startEnd')}
					title="Start and end times"
				>
					Start/End
				</button>
			</div>
		{/if}

		<button
			class="toolbar-btn"
			class:active={showAdvancedVideoControls}
			on:click={toggleAdvancedVideoControls}
			title={showAdvancedVideoControls ? 'Hide video controls' : 'Show video controls (for transcript editing)'}
		>
			<MdVideoLibrary />
		</button>

		<button
			class="toolbar-btn"
			on:click={toggleOrientation}
			title={isVertical ? 'Switch to horizontal layout' : 'Switch to vertical layout'}
		>
			{#if isVertical}
				<MdSwapHoriz />
			{:else}
				<MdSwapVert />
			{/if}
		</button>

		<button
			class="toolbar-btn"
			on:click={handleExport}
			title="Export transcript as CSV"
		>
			<MdFileDownload />
		</button>
	</div>
</div>

<style>
	.editor-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		background-color: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
		flex-shrink: 0;
	}

	.toolbar-left {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.toolbar-title {
		font-weight: 600;
		font-size: 0.875rem;
		color: #374151;
	}

	.dirty-indicator {
		color: #f59e0b;
		font-weight: bold;
		font-size: 1.25rem;
	}

	.toolbar-right {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.toolbar-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0.25rem;
		border: none;
		border-radius: 0.25rem;
		background-color: transparent;
		color: #6b7280;
		cursor: pointer;
		transition: background-color 0.15s, color 0.15s;
	}

	.toolbar-btn:hover {
		background-color: #e5e7eb;
		color: #374151;
	}

	.toolbar-btn:active {
		background-color: #d1d5db;
	}

	.toolbar-btn.active {
		background-color: #dbeafe;
		color: #2563eb;
	}

	.toolbar-btn.active:hover {
		background-color: #bfdbfe;
	}

	.timing-mode-group {
		display: flex;
		border: 1px solid #d1d5db;
		border-radius: 0.25rem;
		overflow: hidden;
		margin-right: 0.25rem;
	}

	.timing-mode-btn {
		padding: 0.25rem 0.5rem;
		border: none;
		border-right: 1px solid #d1d5db;
		background-color: transparent;
		color: #6b7280;
		font-size: 0.7rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.15s, color 0.15s;
		white-space: nowrap;
	}

	.timing-mode-btn:last-child {
		border-right: none;
	}

	.timing-mode-btn:hover {
		background-color: #e5e7eb;
		color: #374151;
	}

	.timing-mode-btn.active {
		background-color: #dbeafe;
		color: #2563eb;
	}

	.timing-mode-btn.active:hover {
		background-color: #bfdbfe;
	}
</style>
