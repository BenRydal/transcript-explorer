<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import TranscriptStore from '../../stores/transcriptStore';
	import UserStore from '../../stores/userStore';
	import EditorStore from '../../stores/editorStore';
	import ConfigStore from '../../stores/configStore';
	import P5Store from '../../stores/p5Store';
	import { getTurnsFromWordArray } from '$lib/core/turn-utils';
	import type { Turn } from '$lib/core/turn-utils';
	import { DataPoint } from '../../models/dataPoint';
	import EditorToolbar from './EditorToolbar.svelte';
	import TranscriptEditorRow from './TranscriptEditorRow.svelte';

	let turns: Turn[] = [];
	let speakers: string[] = [];
	let editorContainer: HTMLElement;

	// Subscribe to transcript changes
	TranscriptStore.subscribe((transcript) => {
		if (transcript.wordArray.length > 0) {
			turns = getTurnsFromWordArray(transcript.wordArray);
		} else {
			turns = [];
		}
	});

	// Get list of unique speakers
	$: speakers = $UserStore.map((u) => u.name);

	// Get user color for a speaker
	function getSpeakerColor(speakerName: string): string {
		const users = $UserStore;
		const user = users.find((u) => u.name === speakerName);
		return user?.color || '#666666';
	}

	// Check if a turn is selected
	function isTurnSelected(turn: Turn): boolean {
		return $EditorStore.selection.selectedTurnNumber === turn.turnNumber;
	}

	// Check if a turn's speaker is highlighted
	function isSpeakerHighlighted(turn: Turn): boolean {
		return $EditorStore.selection.highlightedSpeaker === turn.speaker;
	}

	// Handle turn selection from row component
	function handleTurnSelect(event: CustomEvent<{ turn: Turn }>) {
		const turn = event.detail.turn;

		// Update EditorStore
		EditorStore.update((state) => ({
			...state,
			selection: {
				...state.selection,
				selectedTurnNumber: turn.turnNumber,
				selectedWordIndex: null,
				highlightedSpeaker: null,
				selectionSource: 'editor'
			}
		}));

		// Update ConfigStore to sync with visualizations
		const transcript = get(TranscriptStore);
		const turnWords = transcript.wordArray.filter((dp) => dp.turnNumber === turn.turnNumber);

		if (turnWords.length > 0) {
			const firstWord = turnWords[0];
			ConfigStore.update((config) => ({
				...config,
				firstWordOfTurnSelectedInTurnChart: firstWord,
				arrayOfFirstWords: [firstWord],
				selectedWordFromContributionCloud: firstWord
			}));
		}
	}

	// Handle edit events from row component
	function handleTurnEdit(event: CustomEvent<{ turnNumber: number; field: string; value: any }>) {
		const { turnNumber, field, value } = event.detail;

		// Handle speaker name change - need to update UserStore and recalculate all speaker orders
		let newSpeakerName: string | null = null;
		if (field === 'speaker') {
			newSpeakerName = value.trim().toUpperCase();
		}

		TranscriptStore.update((transcript) => {
			let updatedWordArray: DataPoint[];

			if (field === 'content') {
				// Handle content edit - rebuild words for this turn
				const newWords = value.split(/\s+/).filter(Boolean);

				// Find the first DataPoint of this turn to get metadata
				const turnDataPoints = transcript.wordArray.filter((dp) => dp.turnNumber === turnNumber);
				if (turnDataPoints.length === 0) return transcript;

				const firstDp = turnDataPoints[0];

				// Create new DataPoints for the new words
				const newDataPoints = newWords.map(
					(word: string) =>
						new DataPoint(
							firstDp.speaker,
							turnNumber,
							word,
							firstDp.order,
							firstDp.startTime,
							firstDp.endTime,
							firstDp.useWordCountsAsFallback
						)
				);

				// Build new array: words before this turn + new words + words after this turn
				const wordsBefore = transcript.wordArray.filter((dp) => dp.turnNumber < turnNumber);
				const wordsAfter = transcript.wordArray.filter((dp) => dp.turnNumber > turnNumber);
				updatedWordArray = [...wordsBefore, ...newDataPoints, ...wordsAfter];
			} else if (field === 'speaker') {
				// Handle speaker edit - update speaker name (order will be recalculated below)
				updatedWordArray = transcript.wordArray.map((dp) => {
					if (dp.turnNumber !== turnNumber) return dp;

					return new DataPoint(
						newSpeakerName!,
						dp.turnNumber,
						dp.word,
						dp.order, // Will be recalculated below
						dp.startTime,
						dp.endTime,
						dp.useWordCountsAsFallback
					);
				});
			} else {
				// Handle time edits
				updatedWordArray = transcript.wordArray.map((dp) => {
					if (dp.turnNumber !== turnNumber) return dp;

					return new DataPoint(
						dp.speaker,
						dp.turnNumber,
						dp.word,
						dp.order,
						field === 'time' ? value.startTime : dp.startTime,
						field === 'time' ? value.endTime : dp.endTime,
						dp.useWordCountsAsFallback
					);
				});
			}

			// If speaker was changed, recalculate speaker orders based on transcript order
			if (field === 'speaker') {
				// Get speakers in order of first appearance in transcript
				const speakerOrder: string[] = [];
				updatedWordArray.forEach((dp) => {
					if (!speakerOrder.includes(dp.speaker)) {
						speakerOrder.push(dp.speaker);
					}
				});

				// Create speaker to order mapping
				const speakerToOrder = new Map<string, number>();
				speakerOrder.forEach((speaker, index) => {
					speakerToOrder.set(speaker, index);
				});

				// Update order field in all DataPoints
				updatedWordArray = updatedWordArray.map((dp) => {
					const newOrder = speakerToOrder.get(dp.speaker) ?? dp.order;
					if (newOrder !== dp.order) {
						return new DataPoint(
							dp.speaker,
							dp.turnNumber,
							dp.word,
							newOrder,
							dp.startTime,
							dp.endTime,
							dp.useWordCountsAsFallback
						);
					}
					return dp;
				});

				// Update UserStore to match the new speaker order
				UserStore.update((users) => {
					// Add new speaker if they don't exist
					let updatedUsers = [...users];
					if (!updatedUsers.some((u) => u.name === newSpeakerName)) {
						const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
						const usedColors = updatedUsers.map((u) => u.color);
						const availableColor = colors.find((c) => !usedColors.includes(c)) || colors[updatedUsers.length % colors.length];
						updatedUsers.push({ name: newSpeakerName!, color: availableColor, enabled: true });
					}

					// Reorder users based on transcript order
					const reorderedUsers = speakerOrder.map((speakerName) => {
						return updatedUsers.find((u) => u.name === speakerName)!;
					}).filter(Boolean);

					// Add any users that aren't in the transcript (they may have been removed from all turns)
					updatedUsers.forEach((user) => {
						if (!reorderedUsers.some((u) => u.name === user.name)) {
							reorderedUsers.push(user);
						}
					});

					return reorderedUsers;
				});
			}

			// Recalculate all transcript stats
			const stats = recalculateTranscriptStats(updatedWordArray);

			return {
				...transcript,
				wordArray: updatedWordArray,
				totalNumOfWords: updatedWordArray.length,
				...stats
			};
		});

		// Mark as dirty
		EditorStore.update((state) => ({
			...state,
			isDirty: true
		}));

		// Refresh visualization - use fillAllData to show all words including newly added ones
		const p5Instance = get(P5Store);
		if (p5Instance) {
			p5Instance.fillAllData?.();
		}
	}

	// Recalculate transcript statistics after edits
	function recalculateTranscriptStats(wordArray: DataPoint[]) {
		const speakerWordCounts = new Map<string, number>();
		const speakerTurnCounts = new Map<string, Set<number>>();
		const wordFrequency = new Map<string, number>();
		let maxWordFrequency = 0;
		let mostFrequentWord = '';
		const turnLengths = new Map<number, number>();

		wordArray.forEach(({ speaker, turnNumber, word }) => {
			// Track word count for each speaker
			speakerWordCounts.set(speaker, (speakerWordCounts.get(speaker) || 0) + 1);

			// Track unique turns per speaker
			if (!speakerTurnCounts.has(speaker)) {
				speakerTurnCounts.set(speaker, new Set());
			}
			speakerTurnCounts.get(speaker)?.add(turnNumber);

			// Track turn lengths
			turnLengths.set(turnNumber, (turnLengths.get(turnNumber) || 0) + 1);

			// Track word frequency
			if (word) {
				const lowerWord = word.toLowerCase();
				wordFrequency.set(lowerWord, (wordFrequency.get(lowerWord) || 0) + 1);
				const currentCount = wordFrequency.get(lowerWord) || 0;
				if (currentCount > maxWordFrequency) {
					maxWordFrequency = currentCount;
					mostFrequentWord = word;
				}
			}
		});

		const speakerWordValues = Array.from(speakerWordCounts.values());
		const speakerTurnValues = Array.from(speakerTurnCounts.values()).map((s) => s.size);
		const turnLengthValues = Array.from(turnLengths.values());

		return {
			largestNumOfWordsByASpeaker: speakerWordValues.length > 0 ? Math.max(...speakerWordValues) : 0,
			largestNumOfTurnsByASpeaker: speakerTurnValues.length > 0 ? Math.max(...speakerTurnValues) : 0,
			largestTurnLength: turnLengthValues.length > 0 ? Math.max(...turnLengthValues) : 0,
			totalConversationTurns: turnLengths.size,
			maxCountOfMostRepeatedWord: maxWordFrequency,
			mostFrequentWord
		};
	}

	// Auto-scroll to selected turn when selection changes from visualization
	$: if (
		$EditorStore.selection.selectedTurnNumber !== null &&
		$EditorStore.selection.selectionSource !== 'editor'
	) {
		scrollToTurn($EditorStore.selection.selectedTurnNumber);
	}

	function scrollToTurn(turnNumber: number) {
		const element = document.getElementById(`turn-${turnNumber}`);
		if (element) {
			element.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}
</script>

<div class="transcript-editor" bind:this={editorContainer}>
	<EditorToolbar />

	<div class="editor-content">
		{#if turns.length === 0}
			<div class="empty-state">
				<p class="text-gray-500 text-center py-8">
					No transcript loaded. Upload a CSV or TXT file to get started.
				</p>
			</div>
		{:else}
			<div class="turns-list">
				{#each turns as turn (turn.turnNumber)}
					<div id="turn-{turn.turnNumber}">
						<TranscriptEditorRow
							{turn}
							speakerColor={getSpeakerColor(turn.speaker)}
							isSelected={isTurnSelected(turn)}
							isSpeakerHighlighted={isSpeakerHighlighted(turn)}
							{speakers}
							on:select={handleTurnSelect}
							on:edit={handleTurnEdit}
						/>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.transcript-editor {
		display: flex;
		flex-direction: column;
		height: 100%;
		background-color: #ffffff;
		overflow: hidden;
	}

	.editor-content {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem;
	}

	.turns-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
	}
</style>
