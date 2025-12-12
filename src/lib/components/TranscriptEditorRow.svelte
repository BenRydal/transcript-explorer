<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { Turn } from '$lib/core/turn-utils';
	import { formatTurnTimecode, getTurnContent } from '$lib/core/turn-utils';
	import { TimeUtils } from '$lib/core/time-utils';

	export let turn: Turn;
	export let speakerColor: string = '#666666';
	export let isSelected: boolean = false;
	export let isSpeakerHighlighted: boolean = false;
	export let speakers: string[] = [];

	const dispatch = createEventDispatcher();

	let isEditingContent = false;
	let isEditingSpeaker = false;
	let isEditingTime = false;

	let editedContent = '';
	let editedSpeaker = '';
	let editedStartTime = '';
	let editedEndTime = '';

	// Start editing content
	function startEditingContent() {
		editedContent = getTurnContent(turn);
		isEditingContent = true;
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
		isEditingContent = false;
	}

	// Cancel content editing
	function cancelContentEdit() {
		isEditingContent = false;
		editedContent = '';
	}

	// Start editing speaker
	function startEditingSpeaker() {
		editedSpeaker = turn.speaker;
		isEditingSpeaker = true;
	}

	// Save speaker changes
	function saveSpeaker() {
		const newSpeaker = editedSpeaker.trim().toUpperCase();
		if (newSpeaker && newSpeaker !== turn.speaker) {
			dispatch('edit', {
				turnNumber: turn.turnNumber,
				field: 'speaker',
				value: newSpeaker
			});
		}
		isEditingSpeaker = false;
	}

	// Cancel speaker editing
	function cancelSpeakerEdit() {
		isEditingSpeaker = false;
		editedSpeaker = '';
	}

	// Start editing time
	function startEditingTime() {
		if (turn.useWordCountsAsFallback) {
			editedStartTime = String(turn.startTime);
			editedEndTime = String(turn.endTime);
		} else {
			editedStartTime = TimeUtils.formatTimeAuto(turn.startTime);
			editedEndTime = TimeUtils.formatTimeAuto(turn.endTime);
		}
		isEditingTime = true;
	}

	// Save time changes
	function saveTime() {
		const newStartTime = turn.useWordCountsAsFallback
			? parseInt(editedStartTime) || turn.startTime
			: TimeUtils.toSeconds(editedStartTime) ?? turn.startTime;
		const newEndTime = turn.useWordCountsAsFallback
			? parseInt(editedEndTime) || turn.endTime
			: TimeUtils.toSeconds(editedEndTime) ?? turn.endTime;

		if (newStartTime !== turn.startTime || newEndTime !== turn.endTime) {
			dispatch('edit', {
				turnNumber: turn.turnNumber,
				field: 'time',
				value: { startTime: newStartTime, endTime: newEndTime }
			});
		}
		isEditingTime = false;
	}

	// Cancel time editing
	function cancelTimeEdit() {
		isEditingTime = false;
		editedStartTime = '';
		editedEndTime = '';
	}

	// Handle keyboard events for editing
	function handleContentKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			saveContent();
		} else if (event.key === 'Escape') {
			cancelContentEdit();
		}
	}

	function handleSpeakerKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			saveSpeaker();
		} else if (event.key === 'Escape') {
			cancelSpeakerEdit();
		}
	}

	function handleTimeKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			saveTime();
		} else if (event.key === 'Escape') {
			cancelTimeEdit();
		}
	}

	// Handle row click
	function handleRowClick() {
		dispatch('select', { turn });
	}

	// Format speaker name for display
	function formatSpeaker(name: string): string {
		return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
	}

	// Get time display
	function getTimeDisplay(): string {
		if (turn.useWordCountsAsFallback) {
			return `[${turn.startTime}]`;
		}
		return `[${TimeUtils.formatTimeAuto(turn.startTime)}]`;
	}
</script>

<div
	class="turn-row"
	class:selected={isSelected}
	class:speaker-highlighted={isSpeakerHighlighted}
	on:click={handleRowClick}
	on:keydown={(e) => e.key === 'Enter' && handleRowClick()}
	role="button"
	tabindex="0"
>
	<!-- Timecode -->
	{#if isEditingTime}
		<div class="time-edit-container">
			<input
				type="text"
				class="time-input"
				bind:value={editedStartTime}
				on:keydown={handleTimeKeydown}
				on:blur={saveTime}
				placeholder="Start"
			/>
			<span class="time-separator">-</span>
			<input
				type="text"
				class="time-input"
				bind:value={editedEndTime}
				on:keydown={handleTimeKeydown}
				on:blur={saveTime}
				placeholder="End"
			/>
		</div>
	{:else}
		<button
			class="turn-timecode"
			on:click|stopPropagation={startEditingTime}
			title="Click to edit time"
		>
			{getTimeDisplay()}
		</button>
	{/if}

	<!-- Speaker -->
	{#if isEditingSpeaker}
		<div class="speaker-edit-container" on:click|stopPropagation>
			<input
				type="text"
				class="speaker-input"
				bind:value={editedSpeaker}
				on:keydown={handleSpeakerKeydown}
				on:blur={saveSpeaker}
				list="speakers-list"
			/>
			<datalist id="speakers-list">
				{#each speakers as speaker}
					<option value={speaker}>{speaker}</option>
				{/each}
			</datalist>
		</div>
	{:else}
		<button
			class="turn-speaker"
			style="color: {speakerColor}"
			on:click|stopPropagation={startEditingSpeaker}
			title="Click to edit speaker"
		>
			{formatSpeaker(turn.speaker)}:
		</button>
	{/if}

	<!-- Content -->
	{#if isEditingContent}
		<div class="content-edit-container" on:click|stopPropagation>
			<textarea
				class="content-textarea"
				bind:value={editedContent}
				on:keydown={handleContentKeydown}
				on:blur={saveContent}
				rows="2"
			/>
			<div class="edit-hint">Enter to save, Esc to cancel</div>
		</div>
	{:else}
		<button
			class="turn-content"
			on:click|stopPropagation={startEditingContent}
			title="Click to edit content"
		>
			{getTurnContent(turn)}
		</button>
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
		color: #6b7280;
	}

	.speaker-edit-container {
		flex-shrink: 0;
	}

	.speaker-input {
		width: 120px;
		font-weight: 600;
		padding: 0.25rem;
		border: 1px solid #d1d5db;
		border-radius: 0.25rem;
		text-transform: uppercase;
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
		resize: vertical;
		font-family: inherit;
		font-size: inherit;
	}

	.edit-hint {
		font-size: 0.625rem;
		color: #9ca3af;
		margin-top: 0.125rem;
	}
</style>
