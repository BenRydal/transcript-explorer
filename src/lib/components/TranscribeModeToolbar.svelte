<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import MdClose from 'svelte-icons/md/MdClose.svelte';
	import MdKeyboard from 'svelte-icons/md/MdKeyboard.svelte';

	const dispatch = createEventDispatcher<{
		exit: void;
	}>();

	let showShortcuts = false;
</script>

<div class="transcribe-toolbar">
	<div class="toolbar-left">
		<span class="toolbar-title">
			<div class="icon"><MdKeyboard /></div>
			Transcribe Mode
		</span>
	</div>

	<div class="toolbar-center">
		<button
			class="shortcuts-hint"
			on:click={() => (showShortcuts = !showShortcuts)}
			aria-expanded={showShortcuts}
		>
			Keyboard Shortcuts
			<svg class="chevron" class:open={showShortcuts} viewBox="0 0 24 24" fill="currentColor">
				<path d="M7 10l5 5 5-5z" />
			</svg>
		</button>
	</div>

	<div class="toolbar-right">
		<button class="exit-btn" on:click={() => dispatch('exit')} title="Exit Transcribe Mode (Esc)">
			<div class="icon"><MdClose /></div>
			Exit
		</button>
	</div>
</div>

{#if showShortcuts}
	<div class="shortcuts-panel">
		<div class="shortcuts-grid">
			<div class="shortcut">
				<kbd>Space</kbd>
				<span>Play / Pause</span>
			</div>
			<div class="shortcut">
				<kbd>←</kbd>
				<span>Skip back 5s</span>
			</div>
			<div class="shortcut">
				<kbd>→</kbd>
				<span>Skip forward 5s</span>
			</div>
			<div class="shortcut">
				<kbd>Esc</kbd>
				<span>Exit mode</span>
			</div>
		</div>
	</div>
{/if}

<style>
	.transcribe-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 40px;
		padding: 0 12px;
		background: #1f2937;
		color: white;
		flex-shrink: 0;
	}

	.toolbar-left,
	.toolbar-right {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.toolbar-center {
		display: flex;
		align-items: center;
	}

	.toolbar-title {
		display: flex;
		align-items: center;
		gap: 6px;
		font-weight: 500;
		font-size: 14px;
	}

	.toolbar-title .icon {
		width: 18px;
		height: 18px;
	}

	.shortcuts-hint {
		display: flex;
		align-items: center;
		gap: 4px;
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-radius: 4px;
		padding: 4px 10px;
		font-size: 12px;
		color: rgba(255, 255, 255, 0.8);
		cursor: pointer;
		transition: background 0.15s;
	}

	.shortcuts-hint:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.chevron {
		width: 16px;
		height: 16px;
		transition: transform 0.2s;
	}

	.chevron.open {
		transform: rotate(180deg);
	}

	.exit-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		background: rgba(239, 68, 68, 0.2);
		border: 1px solid rgba(239, 68, 68, 0.4);
		border-radius: 4px;
		padding: 4px 10px;
		font-size: 12px;
		color: #fca5a5;
		cursor: pointer;
		transition: all 0.15s;
	}

	.exit-btn:hover {
		background: rgba(239, 68, 68, 0.3);
		border-color: rgba(239, 68, 68, 0.6);
	}

	.exit-btn .icon {
		width: 14px;
		height: 14px;
	}

	.shortcuts-panel {
		background: #374151;
		padding: 12px 16px;
		border-top: 1px solid #4b5563;
	}

	.shortcuts-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		justify-content: center;
	}

	.shortcut {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: rgba(255, 255, 255, 0.8);
	}

	kbd {
		display: inline-block;
		padding: 2px 6px;
		background: #1f2937;
		border: 1px solid #4b5563;
		border-radius: 4px;
		font-family: monospace;
		font-size: 11px;
		color: white;
		min-width: 24px;
		text-align: center;
	}
</style>
