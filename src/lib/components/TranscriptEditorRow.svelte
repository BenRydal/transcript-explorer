<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import type { Turn } from '$lib/core/turn-utils';
	import { getTurnContent } from '$lib/core/turn-utils';
	import { toSeconds, formatTimeAuto } from '$lib/core/time-utils';
	import { toTitleCase, normalizeSpeakerName } from '$lib/core/string-utils';
	import VideoStore from '../../stores/videoStore';
	import type { TimingMode } from '../../models/transcript';
	import { notifications } from '../../stores/notificationStore';

	let rowElement: HTMLElement;

	export let turn: Turn;
	export let speakerColor: string = '#666666';
	export let isSelected: boolean = false;
	export let isSpeakerHighlighted: boolean = false;
	export let timingMode: TimingMode = 'untimed';

	// Derived flags for easier template logic
	$: showStartTime = timingMode === 'startOnly' || timingMode === 'startEnd';
	$: showEndTime = timingMode === 'startEnd';

	const dispatch = createEventDispatcher();

	let isHovering = false;

	type EditMode = 'none' | 'content' | 'speaker' | 'startTime' | 'endTime';
	let editMode: EditMode = 'none';

	let editedContent = '';
	let editedSpeaker = '';
	let editedStartTime = '';
	let editedEndTime = '';

	// Start editing content
	function startEditingContent() {
		editedContent = getTurnContent(turn);
		editMode = 'content';
	}

	// Save content changes
	function saveContent() {
		if (editedContent.trim() !== getTurnContent(turn)) {
			dispatch('edit', {
				turnNumber: turn.turnNumber,
				field: 'content',
				value: editedContent.trim()
			});
		}
		editMode = 'none';
	}

	// Cancel any editing
	function cancelEdit() {
		editMode = 'none';
	}

	// Start editing speaker
	function startEditingSpeaker() {
		editedSpeaker = turn.speaker;
		editMode = 'speaker';
	}

	// Save speaker changes
	function saveSpeaker() {
		const newSpeaker = normalizeSpeakerName(editedSpeaker);
		if (newSpeaker && newSpeaker !== turn.speaker) {
			dispatch('edit', {
				turnNumber: turn.turnNumber,
				field: 'speaker',
				value: newSpeaker
			});
		}
		editMode = 'none';
	}

	// Start editing start time
	function startEditingStartTime() {
		editedStartTime = formatTimeAuto(turn.startTime);
		editMode = 'startTime';
	}

	// Save start time changes
	function saveStartTime() {
		const parsed = toSeconds(editedStartTime);
		if (parsed === null) {
			notifications.warning('Invalid time format. Use HH:MM:SS, MM:SS, or seconds.');
			editMode = 'none';
			return;
		}

		if (parsed !== turn.startTime) {
			dispatch('edit', {
				turnNumber: turn.turnNumber,
				field: 'time',
				value: { startTime: parsed, endTime: turn.endTime }
			});
		}
		editMode = 'none';
	}

	// Start editing end time
	function startEditingEndTime() {
		editedEndTime = formatTimeAuto(turn.endTime);
		editMode = 'endTime';
	}

	// Save end time changes
	function saveEndTime() {
		const parsed = toSeconds(editedEndTime);
		if (parsed === null) {
			notifications.warning('Invalid time format. Use HH:MM:SS, MM:SS, or seconds.');
			editMode = 'none';
			return;
		}

		if (parsed !== turn.endTime) {
			dispatch('edit', {
				turnNumber: turn.turnNumber,
				field: 'time',
				value: { startTime: turn.startTime, endTime: parsed }
			});
		}
		editMode = 'none';
	}

	// Close edit mode, saving any changes
	function closeEditMode() {
		switch (editMode) {
			case 'startTime':
				saveStartTime();
				break;
			case 'endTime':
				saveEndTime();
				break;
			case 'speaker':
				saveSpeaker();
				break;
			case 'content':
				saveContent();
				break;
		}
	}

	// Single keydown handler for all edit inputs: Enter saves, Escape cancels
	function handleEditKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			cancelEdit();
		} else if (event.key === 'Enter') {
			// Allow Shift+Enter for newlines in content textarea
			if (editMode === 'content' && event.shiftKey) return;
			event.preventDefault();
			closeEditMode();
		}
	}

	// Handle row click
	function handleRowClick() {
		// If edit mode is active, close it first
		closeEditMode();
		dispatch('select', { turn });
	}

	// Handle delete turn
	function handleDelete() {
		dispatch('delete', { turnNumber: turn.turnNumber });
	}

	// Handle add turn after this one
	function handleAddAfter() {
		dispatch('addAfter', { turnNumber: turn.turnNumber, speaker: turn.speaker });
	}

	// Capture current video time for this turn's start time
	function captureStartTime() {
		const videoState = $VideoStore;
		if (videoState.isLoaded) {
			const formattedTime = formatTimeAuto(videoState.currentTime);
			// Update the local input value
			editedStartTime = formattedTime;
			// Also dispatch the edit to save immediately
			dispatch('edit', {
				turnNumber: turn.turnNumber,
				field: 'time',
				value: { startTime: videoState.currentTime, endTime: turn.endTime }
			});
		}
	}

	// Capture current video time for this turn's end time
	function captureEndTime() {
		const videoState = $VideoStore;
		if (videoState.isLoaded) {
			const formattedTime = formatTimeAuto(videoState.currentTime);
			// Update the local input value
			editedEndTime = formattedTime;
			// Also dispatch the edit to save immediately
			dispatch('edit', {
				turnNumber: turn.turnNumber,
				field: 'time',
				value: { startTime: turn.startTime, endTime: videoState.currentTime }
			});
		}
	}

	// Handle clicks outside this row to close edit mode
	onMount(() => {
		function handleDocumentClick(event: MouseEvent) {
			if (editMode !== 'none' && rowElement && !rowElement.contains(event.target as Node)) {
				closeEditMode();
			}
		}

		document.addEventListener('click', handleDocumentClick);
		return () => {
			document.removeEventListener('click', handleDocumentClick);
		};
	});

	// Reactive time displays
	$: startTimeDisplay = `[${formatTimeAuto(turn.startTime)}]`;
	$: endTimeDisplay = `[${formatTimeAuto(turn.endTime)}]`;

	// Auto-resize textarea action
	function autoresize(node: HTMLTextAreaElement) {
		function resize() {
			node.style.height = 'auto';
			node.style.height = node.scrollHeight + 'px';
		}
		resize();
		node.addEventListener('input', resize);
		return { destroy: () => node.removeEventListener('input', resize) };
	}
</script>

<div
	class="turn-row"
	class:selected={isSelected}
	class:speaker-highlighted={isSpeakerHighlighted}
	bind:this={rowElement}
	on:click={handleRowClick}
	on:keydown={(e) => e.key === 'Enter' && handleRowClick()}
	on:mouseenter={() => (isHovering = true)}
	on:mouseleave={() => (isHovering = false)}
	role="button"
	tabindex="0"
>
	<!-- Start Time Column (shown in startOnly and startEnd modes) -->
	{#if showStartTime}
		{#if editMode === 'startTime'}
			<div class="time-edit-container" on:click|stopPropagation>
				{#if $VideoStore.isLoaded}
					<button class="time-capture-btn capture-start-btn" on:click={captureStartTime} title="Set IN point from video">
						<span class="capture-bracket">[</span>
					</button>
				{/if}
				<input
					type="text"
					class="time-input"
					bind:value={editedStartTime}
					on:keydown={handleEditKeydown}
					on:blur={saveStartTime}
					placeholder="Start"
				/>
			</div>
		{:else}
			<button class="turn-timecode" on:click|stopPropagation={startEditingStartTime} title="Click to edit start time">
				{startTimeDisplay}
			</button>
		{/if}
	{/if}

	<!-- Duration separator (shown only in startEnd mode) -->
	{#if showEndTime}
		<span class="time-separator">-</span>
	{/if}

	<!-- End Time Column (shown only in startEnd mode) -->
	{#if showEndTime}
		{#if editMode === 'endTime'}
			<div class="time-edit-container" on:click|stopPropagation>
				<input type="text" class="time-input" bind:value={editedEndTime} on:keydown={handleEditKeydown} on:blur={saveEndTime} placeholder="End" />
				{#if $VideoStore.isLoaded}
					<button class="time-capture-btn capture-end-btn" on:click={captureEndTime} title="Set OUT point from video">
						<span class="capture-bracket">]</span>
					</button>
				{/if}
			</div>
		{:else}
			<button class="turn-timecode" on:click|stopPropagation={startEditingEndTime} title="Click to edit end time">
				{endTimeDisplay}
			</button>
		{/if}
	{/if}

	<!-- Speaker -->
	{#if editMode === 'speaker'}
		<input
			type="text"
			class="speaker-input"
			bind:value={editedSpeaker}
			on:keydown={handleEditKeydown}
			on:blur={saveSpeaker}
			on:click|stopPropagation
			placeholder="Speaker name..."
		/>
	{:else}
		<button class="turn-speaker" style="color: {speakerColor}" on:click|stopPropagation={startEditingSpeaker} title="Click to edit speaker">
			{toTitleCase(turn.speaker)}:
		</button>
	{/if}

	<!-- Content -->
	{#if editMode === 'content'}
		<div class="content-edit-container" on:click|stopPropagation>
			<textarea class="content-textarea" bind:value={editedContent} on:keydown={handleEditKeydown} on:blur={saveContent} use:autoresize />
			<div class="edit-hint">Enter to save, Esc to cancel</div>
		</div>
	{:else}
		<button class="turn-content" on:click|stopPropagation={startEditingContent} title="Click to edit content">
			{getTurnContent(turn)}
		</button>
	{/if}

	<!-- Action buttons (visible on hover) -->
	{#if isHovering}
		<div class="row-actions" on:click|stopPropagation>
			<button class="action-btn add-btn" on:click={handleAddAfter} title="Add turn after">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
				</svg>
			</button>
			<button class="action-btn delete-btn" on:click={handleDelete} title="Delete turn">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
					<path
						fill-rule="evenodd"
						d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
						clip-rule="evenodd"
					/>
				</svg>
			</button>
		</div>
	{/if}
</div>

<style>
	.turn-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-radius: 0.25rem;
		cursor: pointer;
		transition: background-color 0.15s;
		border-left: 3px solid transparent;
		align-items: flex-start;
	}

	.turn-row:hover {
		background-color: #f3f4f6;
	}

	.turn-row.selected {
		background-color: #dbeafe;
		border-left-color: #3b82f6;
	}

	.turn-row.speaker-highlighted {
		background-color: #fef3c7;
		border-left-color: #f59e0b;
	}

	.turn-row.selected.speaker-highlighted {
		background-color: #dbeafe;
		border-left-color: #3b82f6;
	}

	.turn-timecode {
		font-family: monospace;
		font-size: 0.75rem;
		color: #6b7280;
		flex-shrink: 0;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		border-radius: 0.25rem;
	}

	.turn-timecode:hover {
		background-color: #e5e7eb;
		padding: 0.125rem 0.25rem;
		margin: -0.125rem -0.25rem;
	}

	.turn-speaker {
		font-weight: 600;
		flex-shrink: 0;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		border-radius: 0.25rem;
	}

	.turn-speaker:hover {
		background-color: #e5e7eb;
		padding: 0.125rem 0.25rem;
		margin: -0.125rem -0.25rem;
	}

	.turn-content {
		color: #374151;
		word-break: break-word;
		text-align: left;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		flex: 1;
		min-width: 200px;
		border-radius: 0.25rem;
	}

	.turn-content:hover {
		background-color: #e5e7eb;
		padding: 0.125rem 0.25rem;
		margin: -0.125rem -0.25rem;
	}

	/* Edit containers */
	.time-edit-container {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.time-input {
		width: 70px;
		font-family: monospace;
		font-size: 0.75rem;
		padding: 0.25rem;
		border: 1px solid #d1d5db;
		border-radius: 0.25rem;
	}

	.time-separator {
		color: #9ca3af;
		font-size: 0.75rem;
		user-select: none;
	}

	.time-capture-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.25rem;
		height: 1.25rem;
		border: none;
		border-radius: 0.25rem;
		cursor: pointer;
		transition:
			background-color 0.15s,
			color 0.15s;
		background-color: #e5e7eb;
		color: #6b7280;
		flex-shrink: 0;
	}

	.time-capture-btn.capture-start-btn:hover {
		color: #2563eb;
		background-color: #dbeafe;
	}

	.time-capture-btn.capture-end-btn:hover {
		color: #7c3aed;
		background-color: #ede9fe;
	}

	.capture-bracket {
		font-weight: bold;
		font-size: 0.875rem;
		line-height: 1;
	}

	.speaker-input {
		width: 100px;
		font-weight: 600;
		padding: 0.25rem;
		border: 1px solid #d1d5db;
		border-radius: 0.25rem;
		text-transform: uppercase;
		flex-shrink: 0;
	}

	.content-edit-container {
		flex: 1;
		min-width: 200px;
	}

	.content-textarea {
		width: 100%;
		padding: 0.25rem;
		border: 1px solid #d1d5db;
		border-radius: 0.25rem;
		font-family: inherit;
		font-size: inherit;
		min-height: 2.5rem;
		overflow: hidden;
		resize: none;
	}

	.edit-hint {
		font-size: 0.625rem;
		color: #9ca3af;
		margin-top: 0.125rem;
	}

	/* Action buttons */
	.row-actions {
		display: flex;
		gap: 0.25rem;
		align-items: center;
		margin-left: auto;
		flex-shrink: 0;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		border: none;
		border-radius: 0.25rem;
		cursor: pointer;
		transition:
			background-color 0.15s,
			color 0.15s;
		background-color: transparent;
		color: #9ca3af;
	}

	.action-btn:hover {
		background-color: #e5e7eb;
	}

	.add-btn:hover {
		color: #059669;
		background-color: #d1fae5;
	}

	.delete-btn:hover {
		color: #dc2626;
		background-color: #fee2e2;
	}
</style>
