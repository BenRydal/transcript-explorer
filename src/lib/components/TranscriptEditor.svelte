<script lang="ts">
	import { get } from 'svelte/store';
	import TranscriptStore from '../../stores/transcriptStore';
	import UserStore from '../../stores/userStore';
	import EditorStore from '../../stores/editorStore';
	import ConfigStore from '../../stores/configStore';
	import P5Store from '../../stores/p5Store';
	import { getTurnsFromWordArray, getTurnContent } from '$lib/core/turn-utils';
	import {
		applyTimingModeToWordArray,
		updateTimelineFromData,
		getMaxTime
	} from '$lib/core/timing-utils';
	import type { Turn } from '$lib/core/turn-utils';
	import { DataPoint } from '../../models/dataPoint';
	import { USER_COLORS } from '$lib/constants/ui';
	import EditorToolbar from './EditorToolbar.svelte';
	import TranscriptEditorRow from './TranscriptEditorRow.svelte';

	import type { TimingMode } from '../../models/transcript';

	// Reactively derive turns from TranscriptStore
	$: turns =
		$TranscriptStore.wordArray.length > 0
			? getTurnsFromWordArray($TranscriptStore.wordArray)
			: [];
	$: timingMode = $TranscriptStore.timingMode;

	// Get enabled speakers from UserStore
	$: enabledSpeakers = new Set($UserStore.filter((u) => u.enabled).map((u) => u.name));

	// Filter turns by speaker visibility, locked filter, and search term
	$: displayedTurns = turns
		.filter((turn) => enabledSpeakers.has(turn.speaker))
		.filter(
			(turn) =>
				!$EditorStore.selection.filteredSpeaker ||
				turn.speaker === $EditorStore.selection.filteredSpeaker
		)
		.filter((turn) => {
			if (!$ConfigStore.wordToSearch) return true;
			return getTurnContent(turn).toLowerCase().includes($ConfigStore.wordToSearch.toLowerCase());
		});

	// Clear the locked speaker filter
	function clearSpeakerFilter() {
		EditorStore.update((state) => ({
			...state,
			selection: {
				...state.selection,
				filteredSpeaker: null,
				highlightedSpeaker: null,
				selectionSource: null
			}
		}));
	}

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
							firstDp.startTime,
							firstDp.endTime
						)
				);

				// Build new array: words before this turn + new words + words after this turn
				const wordsBefore = transcript.wordArray.filter((dp) => dp.turnNumber < turnNumber);
				const wordsAfter = transcript.wordArray.filter((dp) => dp.turnNumber > turnNumber);
				updatedWordArray = [...wordsBefore, ...newDataPoints, ...wordsAfter];
			} else if (field === 'speaker') {
				// Handle speaker edit - update speaker name
				updatedWordArray = transcript.wordArray.map((dp) => {
					if (dp.turnNumber !== turnNumber) return dp;

					return new DataPoint(
						newSpeakerName!,
						dp.turnNumber,
						dp.word,
						dp.startTime,
						dp.endTime
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
						field === 'time' ? value.startTime : dp.startTime,
						field === 'time' ? value.endTime : dp.endTime
					);
				});
			}

			// If time was changed, sort by start time and renumber turns
			if (field === 'time') {
				// Group words by turn
				const turnGroups = new Map<number, DataPoint[]>();
				updatedWordArray.forEach((dp) => {
					if (!turnGroups.has(dp.turnNumber)) {
						turnGroups.set(dp.turnNumber, []);
					}
					turnGroups.get(dp.turnNumber)!.push(dp);
				});

				// Sort turns by their start time (use first word's startTime)
				const sortedTurns = Array.from(turnGroups.entries()).sort((a, b) => {
					const aStart = a[1][0]?.startTime ?? 0;
					const bStart = b[1][0]?.startTime ?? 0;
					return aStart - bStart;
				});

				// Renumber turns and rebuild word array
				updatedWordArray = [];
				sortedTurns.forEach(([_oldTurnNumber, words], newTurnIndex) => {
					words.forEach((dp) => {
						updatedWordArray.push(
							new DataPoint(
								dp.speaker,
								newTurnIndex, // new turn number based on sorted order
								dp.word,
								dp.startTime,
								dp.endTime
							)
						);
					});
				});
			}

			// If speaker was changed, update UserStore
			if (field === 'speaker') {
				// Get speakers in order of first appearance in transcript
				const speakerOrder: string[] = [];
				updatedWordArray.forEach((dp) => {
					if (!speakerOrder.includes(dp.speaker)) {
						speakerOrder.push(dp.speaker);
					}
				});

				// Update UserStore to match the new speaker order
				UserStore.update((users) => {
					// Add new speaker if they don't exist
					let updatedUsers = [...users];
					if (!updatedUsers.some((u) => u.name === newSpeakerName)) {
						const usedColors = updatedUsers.map((u) => u.color);
						const availableColor = USER_COLORS.find((c) => !usedColors.includes(c)) || USER_COLORS[updatedUsers.length % USER_COLORS.length];
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

			// Apply timing mode recalculations and finalize
			const result = finalizeWordArrayEdit(updatedWordArray, transcript.timingMode);

			return {
				...transcript,
				wordArray: result.wordArray,
				totalNumOfWords: result.wordArray.length,
				totalTimeInSeconds: result.maxTime,
				...result.stats
			};
		});

		markDirtyAndRefresh();
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

	// Helper: finalize word array after edit (apply timing mode, update timeline, calc stats)
	function finalizeWordArrayEdit(
		wordArray: DataPoint[],
		timingMode: TimingMode
	): { wordArray: DataPoint[]; stats: ReturnType<typeof recalculateTranscriptStats>; maxTime: number } {
		const processedWordArray = applyTimingModeToWordArray(wordArray, timingMode);
		updateTimelineFromData(processedWordArray);
		const stats = recalculateTranscriptStats(processedWordArray);
		const maxTime = getMaxTime(processedWordArray);
		return { wordArray: processedWordArray, stats, maxTime };
	}

	// Helper: mark editor dirty and refresh visualization
	function markDirtyAndRefresh() {
		EditorStore.update((state) => ({
			...state,
			isDirty: true
		}));
		const p5Instance = get(P5Store);
		if (p5Instance) {
			p5Instance.fillAllData?.();
		}
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

	// Handle delete turn
	function handleTurnDelete(event: CustomEvent<{ turnNumber: number }>) {
		const { turnNumber } = event.detail;

		if (!confirm('Delete this turn?')) {
			return;
		}

		TranscriptStore.update((transcript) => {
			// Remove all words from this turn
			const updatedWordArray = transcript.wordArray.filter((dp) => dp.turnNumber !== turnNumber);

			// Renumber turns that come after the deleted one
			let renumberedWordArray = updatedWordArray.map((dp) => {
				if (dp.turnNumber > turnNumber) {
					return new DataPoint(
						dp.speaker,
						dp.turnNumber - 1,
						dp.word,
						dp.startTime,
						dp.endTime
					);
				}
				return dp;
			});

			// Apply timing mode recalculations and finalize
			const result = finalizeWordArrayEdit(renumberedWordArray, transcript.timingMode);

			// Remove speakers from UserStore who no longer have any turns
			const remainingSpeakers = new Set(result.wordArray.map((dp) => dp.speaker));
			UserStore.update((users) => users.filter((user) => remainingSpeakers.has(user.name)));

			return {
				...transcript,
				wordArray: result.wordArray,
				totalNumOfWords: result.wordArray.length,
				totalTimeInSeconds: result.maxTime,
				...result.stats
			};
		});

		markDirtyAndRefresh();
	}

	// Handle add turn after
	function handleAddAfter(event: CustomEvent<{ turnNumber: number; speaker: string }>) {
		const { turnNumber, speaker } = event.detail;

		TranscriptStore.update((transcript) => {
			// Get the last word of the current turn to get timing info
			const currentTurnWords = transcript.wordArray.filter((dp) => dp.turnNumber === turnNumber);
			const lastWord = currentTurnWords[currentTurnWords.length - 1];

			// Create a new turn number
			const newTurnNumber = turnNumber + 1;

			// Renumber all turns after the insertion point
			const renumberedWordArray = transcript.wordArray.map((dp) => {
				if (dp.turnNumber > turnNumber) {
					return new DataPoint(
						dp.speaker,
						dp.turnNumber + 1,
						dp.word,
						dp.startTime,
						dp.endTime
					);
				}
				return dp;
			});

			// Create a new DataPoint for the new turn with placeholder text
			const newDataPoint = new DataPoint(
				speaker,
				newTurnNumber,
				'[new]',
				lastWord?.endTime ?? 0,
				lastWord?.endTime ?? 0
			);

			// Insert the new turn at the right position
			const insertIndex = renumberedWordArray.findIndex((dp) => dp.turnNumber > newTurnNumber);
			if (insertIndex === -1) {
				renumberedWordArray.push(newDataPoint);
			} else {
				renumberedWordArray.splice(insertIndex, 0, newDataPoint);
			}

			// Apply timing mode recalculations and finalize
			const result = finalizeWordArrayEdit(renumberedWordArray, transcript.timingMode);

			return {
				...transcript,
				wordArray: result.wordArray,
				totalNumOfWords: result.wordArray.length,
				totalTimeInSeconds: result.maxTime,
				...result.stats
			};
		});

		markDirtyAndRefresh();
	}
</script>

<div class="transcript-editor">
	<EditorToolbar />

	<div class="editor-content">
		{#if turns.length === 0}
			<div class="empty-state">
				<p class="text-gray-500 text-center py-8">
					No transcript loaded. Upload a CSV or TXT file to get started.
				</p>
			</div>
		{:else}
			{#if $EditorStore.selection.filteredSpeaker}
				<div class="filter-banner">
					<span>
						Showing turns by <strong>{$EditorStore.selection.filteredSpeaker}</strong>
						<span class="filter-count">({displayedTurns.length} of {turns.length} turns)</span>
					</span>
					{#if $EditorStore.selection.selectionSource === 'distributionDiagramClick'}
						<button class="clear-filter-btn" on:click={clearSpeakerFilter}>× Show all</button>
					{/if}
				</div>
			{/if}
			<div class="turns-list">
				{#each displayedTurns as turn (turn.turnNumber)}
					<div id="turn-{turn.turnNumber}">
						<TranscriptEditorRow
							{turn}
							speakerColor={getSpeakerColor(turn.speaker)}
							isSelected={isTurnSelected(turn)}
							isSpeakerHighlighted={isSpeakerHighlighted(turn)}
							{timingMode}
							on:select={handleTurnSelect}
							on:edit={handleTurnEdit}
							on:delete={handleTurnDelete}
							on:addAfter={handleAddAfter}
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

	.filter-banner {
		display: flex;
		justify-content: space-between;
		align-items: center;
		background-color: #f0f9ff;
		border: 1px solid #bae6fd;
		border-radius: 6px;
		padding: 0.5rem 0.75rem;
		margin-bottom: 0.5rem;
		font-size: 0.875rem;
		color: #0369a1;
	}

	.filter-count {
		opacity: 0.7;
		margin-left: 0.25rem;
	}

	.clear-filter-btn {
		background: none;
		border: 1px solid #0369a1;
		border-radius: 4px;
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
		color: #0369a1;
		cursor: pointer;
		transition: background-color 0.15s;
	}

	.clear-filter-btn:hover {
		background-color: #e0f2fe;
	}
</style>
