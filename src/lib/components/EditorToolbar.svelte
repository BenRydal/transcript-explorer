<script lang="ts">
	import { ArrowDownUp, ArrowLeftRight, Download, Clapperboard, Undo2, Redo2 } from '@lucide/svelte';
	import { get } from 'svelte/store';
	import EditorStore from '../../stores/editorStore';
	import TranscriptStore from '../../stores/transcriptStore';
	import P5Store from '../../stores/p5Store';
	import HistoryStore from '../../stores/historyStore';
	import ConfirmModal from './ConfirmModal.svelte';
	import { exportTranscriptToCSV } from '$lib/core/export-utils';
	import { applyTimingModeToWordArray, updateTimelineFromData } from '$lib/core/timing-utils';
	import type { TimingMode } from '../../models/transcript';

	interface Props {
		onundo?: () => void;
		onredo?: () => void;
	}

	let { onundo, onredo }: Props = $props();

	let showConfirmModal = $state(false);
	let pendingMode: TimingMode | null = $state(null);
	let confirmMessage = $state('');

	function toggleOrientation() {
		EditorStore.update((state) => ({
			...state,
			config: { ...state.config, orientation: state.config.orientation === 'vertical' ? 'horizontal' : 'vertical' }
		}));
	}

	function toggleAdvancedVideoControls() {
		EditorStore.update((state) => ({
			...state,
			config: { ...state.config, showAdvancedVideoControls: !state.config.showAdvancedVideoControls }
		}));
	}

	function setTimingMode(mode: TimingMode) {
		const currentMode = get(TranscriptStore).timingMode;
		if (mode === currentMode) return;

		if (mode === 'untimed') {
			pendingMode = mode;
			confirmMessage = 'This will remove all timestamps. This cannot be undone.';
			showConfirmModal = true;
		} else if (mode === 'startOnly' && currentMode === 'startEnd') {
			pendingMode = mode;
			confirmMessage = 'This will remove end times. This cannot be undone.';
			showConfirmModal = true;
		} else {
			applyTimingMode(mode);
		}
	}

	function applyTimingMode(mode: TimingMode) {
		TranscriptStore.update((t) => ({
			...t,
			wordArray: applyTimingModeToWordArray(t.wordArray, mode),
			timingMode: mode
		}));
		updateTimelineFromData(get(TranscriptStore).wordArray, false);
		EditorStore.update((s) => ({ ...s, isDirty: true }));
		get(P5Store)?.fillAllData?.();
	}

	function onConfirm() {
		if (pendingMode) applyTimingMode(pendingMode);
		pendingMode = null;
	}

	let isVertical = $derived($EditorStore.config.orientation === 'vertical');
	let showAdvancedVideoControls = $derived($EditorStore.config.showAdvancedVideoControls);
	let timingMode = $derived($TranscriptStore.timingMode);
	let hasTranscript = $derived($TranscriptStore.wordArray.length > 0);
	let canUndo = $derived($HistoryStore.past.length > 0);
	let canRedo = $derived($HistoryStore.future.length > 0);
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
				<button class="timing-mode-btn" class:active={timingMode === 'untimed'} onclick={() => setTimingMode('untimed')} title="No timestamps">
					Untimed
				</button>
				<button class="timing-mode-btn" class:active={timingMode === 'startOnly'} onclick={() => setTimingMode('startOnly')} title="Start times only">
					Start
				</button>
				<button
					class="timing-mode-btn"
					class:active={timingMode === 'startEnd'}
					onclick={() => setTimingMode('startEnd')}
					title="Start and end times"
				>
					Start/End
				</button>
			</div>
		{/if}

		<button class="toolbar-btn" onclick={() => onundo?.()} disabled={!canUndo} title="Undo (Ctrl+Z)">
			<Undo2 size={16} />
		</button>

		<button class="toolbar-btn" onclick={() => onredo?.()} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
			<Redo2 size={16} />
		</button>

		<button
			class="toolbar-btn"
			class:active={showAdvancedVideoControls}
			onclick={toggleAdvancedVideoControls}
			title={showAdvancedVideoControls ? 'Hide video controls' : 'Show video controls (for transcript editing)'}
		>
			<Clapperboard size={16} />
		</button>

		<button class="toolbar-btn" onclick={toggleOrientation} title={isVertical ? 'Switch to horizontal layout' : 'Switch to vertical layout'}>
			{#if isVertical}
				<ArrowLeftRight size={16} />
			{:else}
				<ArrowDownUp size={16} />
			{/if}
		</button>

		<button class="toolbar-btn" onclick={exportTranscriptToCSV} title="Export transcript as CSV">
			<Download size={16} />
		</button>
	</div>
</div>

<ConfirmModal bind:isOpen={showConfirmModal} title="Change Timing Mode?" message={confirmMessage} onconfirm={onConfirm} />

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
		transition:
			background-color 0.15s,
			color 0.15s;
	}

	.toolbar-btn:hover {
		background-color: #e5e7eb;
		color: #374151;
	}

	.toolbar-btn:active {
		background-color: #d1d5db;
	}

	.toolbar-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.toolbar-btn:disabled:hover {
		background-color: transparent;
		color: #6b7280;
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
		transition:
			background-color 0.15s,
			color 0.15s;
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
