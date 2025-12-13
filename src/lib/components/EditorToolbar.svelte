<script lang="ts">
	import MdSwapVert from 'svelte-icons/md/MdSwapVert.svelte';
	import MdSwapHoriz from 'svelte-icons/md/MdSwapHoriz.svelte';
	import MdFileDownload from 'svelte-icons/md/MdFileDownload.svelte';
	import MdVideoLibrary from 'svelte-icons/md/MdVideoLibrary.svelte';
	import EditorStore from '../../stores/editorStore';
	import { exportTranscriptToCSV } from '$lib/core/export-utils';

	function toggleOrientation() {
		EditorStore.update((state) => ({
			...state,
			config: {
				...state.config,
				orientation: state.config.orientation === 'vertical' ? 'horizontal' : 'vertical',
				// Swap panel sizes when changing orientation
				panelSizes: [state.config.panelSizes[0], state.config.panelSizes[1]]
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

	function handleExport() {
		exportTranscriptToCSV();
	}

	$: isVertical = $EditorStore.config.orientation === 'vertical';
	$: showAdvancedVideoControls = $EditorStore.config.showAdvancedVideoControls;
</script>

<div class="editor-toolbar">
	<div class="toolbar-left">
		<span class="toolbar-title">Transcript</span>
		{#if $EditorStore.isDirty}
			<span class="dirty-indicator" title="Unsaved changes">*</span>
		{/if}
	</div>

	<div class="toolbar-right">
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
</style>
