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

	let isHovering = false;

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

	// Handle delete turn
	function handleDelete() {
		dispatch('delete', { turnNumber: turn.turnNumber });
	}

	// Handle add turn after this one
	function handleAddAfter() {
		dispatch('addAfter', { turnNumber: turn.turnNumber, speaker: turn.speaker });
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
	on:mouseenter={() => (isHovering = true)}
	on:mouseleave={() => (isHovering = false)}
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

	<!-- Action buttons (visible on hover) -->
	{#if isHovering}
		<div class="row-actions" on:click|stopPropagation>
			<button
				class="action-btn add-btn"
				on:click={handleAddAfter}
				title="Add turn after"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
				</svg>
			</button>
			<button
				class="action-btn delete-btn"
				on:click={handleDelete}
				title="Delete turn"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
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
		transition: background-color 0.15s, color 0.15s;
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
