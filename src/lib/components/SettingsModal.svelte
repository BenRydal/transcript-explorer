<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { get } from 'svelte/store';
	import ConfigStore, { type ConfigStoreType } from '../../stores/configStore';
	import TimelineStore from '../../stores/timelineStore';
	import TranscriptStore from '../../stores/transcriptStore';
	import { applyTimingModeToWordArray, updateTimelineFromData } from '$lib/core/timing-utils';
	import P5Store from '../../stores/p5Store';

	export let isOpen = false;

	const dispatch = createEventDispatcher();

	function handleConfigChange(key: keyof ConfigStoreType, value: any) {
		ConfigStore.update((store) => ({ ...store, [key]: value }));
	}

	function recalculateStartOnlyEndTimes() {
		if ($TranscriptStore.timingMode !== 'startOnly' || $TranscriptStore.wordArray.length === 0) return;
		TranscriptStore.update((transcript) => ({
			...transcript,
			wordArray: applyTimingModeToWordArray(transcript.wordArray, 'startOnly')
		}));
		updateTimelineFromData(get(TranscriptStore).wordArray, false);
		const p5Instance = get(P5Store);
		p5Instance?.fillAllData?.();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') isOpen = false;
	}

	function openDataExplorer() {
		dispatch('openDataExplorer');
	}
</script>

{#if isOpen}
	<div
		class="modal modal-open"
		on:click|self={() => (isOpen = false)}
		on:keydown={handleKeydown}
		role="dialog"
		aria-modal="true"
	>
		<div class="modal-box w-11/12 max-w-md p-8">
			<div class="flex justify-between mb-6">
				<h3 class="font-bold text-xl">Settings</h3>
				<button class="btn btn-circle btn-sm" on:click={() => (isOpen = false)}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="flex flex-col space-y-6">
				<!-- Timeline Duration -->
				<div class="flex flex-col">
					<label for="inputSeconds" class="font-medium">Timeline Duration (seconds)</label>
					<input
						id="inputSeconds"
						type="text"
						value={$TimelineStore.endTime}
						on:input={(e) => {
							let value = parseInt(e.target.value.replace(/\D/g, '')) || 0;
							TimelineStore.update((timeline) => {
								timeline.setCurrTime(0);
								timeline.setStartTime(0);
								timeline.setEndTime(value);
								timeline.setLeftMarker(0);
								timeline.setRightMarker(value);
								return timeline;
							});
						}}
						class="input input-bordered"
					/>
				</div>

				<!-- Start-Only Mode Settings -->
				<div class="flex flex-col border-t pt-4">
					<p class="font-medium mb-2">Turn End Time Calculation:</p>
					<p class="text-sm text-gray-600 mb-3">For transcripts with only start times</p>
					<div class="flex flex-col gap-2">
						<label class="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								name="endTimeCalculation"
								class="radio radio-sm"
								checked={!$ConfigStore.preserveGapsBetweenTurns}
								on:change={() => {
									handleConfigChange('preserveGapsBetweenTurns', false);
									recalculateStartOnlyEndTimes();
								}}
							/>
							<span class="text-sm">Fill to next turn <span class="text-gray-500">(no gaps between speakers)</span></span>
						</label>
						<label class="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								name="endTimeCalculation"
								class="radio radio-sm"
								checked={$ConfigStore.preserveGapsBetweenTurns}
								on:change={() => {
									handleConfigChange('preserveGapsBetweenTurns', true);
									recalculateStartOnlyEndTimes();
								}}
							/>
							<span class="text-sm">Estimate from speech rate <span class="text-gray-500">(preserves silence/gaps)</span></span>
						</label>
					</div>
					<div class="flex flex-col mt-3">
						<label for="speechRate" class="text-sm">
							Speech rate: {$ConfigStore.speechRateWordsPerSecond} words/sec
						</label>
						<input
							id="speechRate"
							type="range"
							min="1"
							max="6"
							step="0.5"
							value={$ConfigStore.speechRateWordsPerSecond}
							on:input={(e) => {
								handleConfigChange('speechRateWordsPerSecond', parseFloat(e.target.value));
								recalculateStartOnlyEndTimes();
							}}
							class="range range-sm"
						/>
					</div>
				</div>
			</div>

			<div class="flex justify-center mt-6">
				<button class="btn btn-sm" on:click={openDataExplorer}>Data Explorer</button>
			</div>

			<div class="modal-action">
				<button class="btn" on:click={() => (isOpen = false)}>Close</button>
			</div>
		</div>
	</div>
{/if}
