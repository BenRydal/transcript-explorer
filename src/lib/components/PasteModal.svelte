<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import {
		parseTranscriptText,
		mergeSameSpeakerTurns,
		getFormatDescription,
		SELECTABLE_FORMATS,
		type ParseResult,
		type DetectedFormat
	} from '$lib/core/text-parser';
	import { toTitleCase } from '$lib/core/string-utils';
	import { formatTimeAuto } from '$lib/core/time-utils';

	interface Props {
		isOpen: boolean;
		onimport?: (result: ParseResult) => void;
	}

	let { isOpen = $bindable(false), onimport }: Props = $props();

	let inputText = $state('');
	let selectedFormat: DetectedFormat | 'auto' = $state('auto');
	let mergeSameSpeaker = $state(false);
	let parseResult: ParseResult | null = $state(null);
	let debounceTimer: ReturnType<typeof setTimeout> | null = $state(null);
	let textareaRef: HTMLTextAreaElement;

	// Track last parsed state for debounce optimization
	let lastParsedInput = $state('');
	let lastParsedFormat: DetectedFormat | 'auto' = $state('auto');
	let lastParsedMerge = $state(false);

	function clearDebounce() {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}
	}

	onDestroy(clearDebounce);

	$effect(() => {
		if (isOpen) {
			tick().then(() => textareaRef?.focus());
		}
	});

	function doParse() {
		if (!inputText.trim()) {
			parseResult = null;
		} else {
			const forceFormat = selectedFormat === 'auto' ? undefined : selectedFormat;
			let result = parseTranscriptText(inputText, forceFormat);
			if (mergeSameSpeaker) result = mergeSameSpeakerTurns(result);
			parseResult = result;
		}
		lastParsedInput = inputText;
		lastParsedFormat = selectedFormat;
		lastParsedMerge = mergeSameSpeaker;
	}

	// Debounce text changes; parse immediately on option changes
	$effect(() => {
		const textChanged = inputText !== lastParsedInput;
		const optionsChanged = selectedFormat !== lastParsedFormat || mergeSameSpeaker !== lastParsedMerge;

		clearDebounce();

		if (optionsChanged && !textChanged) {
			doParse();
		} else if (textChanged) {
			debounceTimer = setTimeout(doParse, 200);
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}

	function close() {
		isOpen = false;
		inputText = '';
		selectedFormat = 'auto';
		mergeSameSpeaker = false;
		parseResult = null;
		lastParsedInput = '';
		lastParsedFormat = 'auto';
		lastParsedMerge = false;
		clearDebounce();
	}

	function handleImport() {
		if (parseResult?.turns.length) {
			onimport?.(parseResult);
			close();
		}
	}

	function truncate(text: string, maxLength: number): string {
		return text.length <= maxLength ? text : text.slice(0, maxLength) + '...';
	}
</script>

{#if isOpen}
	<div
		class="modal modal-open"
		onclick={(e) => {
			if (e.target === e.currentTarget) close();
		}}
		onkeydown={handleKeydown}
		role="dialog"
		aria-modal="true"
		aria-labelledby="paste-modal-title"
	>
		<div class="modal-box w-11/12 max-w-2xl max-h-[90vh] flex flex-col">
			<div class="flex justify-between mb-4">
				<h3 id="paste-modal-title" class="font-bold text-lg">Paste Transcript Text</h3>
				<button class="btn btn-circle btn-sm" onclick={close}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="flex-shrink-0">
				<textarea
					bind:this={textareaRef}
					class="textarea textarea-bordered w-full h-52 font-mono text-sm"
					placeholder="Paste your transcript here...

Supported formats (: or TAB as separator):
  Alice: Hello
  Alice[TAB]Hello

With timestamps:
  [0:01:23] Alice: Hello
  [0:01:23] Hello (no speaker)
  [12:34 PM] Alice: Hello (chat logs)
  0:01:23[TAB]Alice[TAB]Hello (Zoom)
  Alice:[TAB]0:01:23[TAB]Hello"
					bind:value={inputText}
				></textarea>
			</div>

			<!-- Options -->
			<div class="mt-3 flex items-center gap-4 flex-shrink-0 flex-wrap">
				<div class="flex items-center gap-2">
					<label class="text-sm font-medium" for="format-select">Format:</label>
					<select id="format-select" class="select select-bordered select-sm max-w-xs" bind:value={selectedFormat}>
						{#each SELECTABLE_FORMATS as format}
							<option value={format.value}>{format.label}</option>
						{/each}
					</select>
				</div>
				<label class="flex items-center gap-2 cursor-pointer">
					<input type="checkbox" class="checkbox checkbox-sm" bind:checked={mergeSameSpeaker} />
					<span class="text-sm">Merge same speaker</span>
				</label>
			</div>

			{#if parseResult}
				<div class="mt-4 p-3 bg-base-200 rounded-lg flex-shrink-0">
					<div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
						<span>
							<span class="font-medium">Detected:</span>
							{getFormatDescription(parseResult.detectedFormat)}
						</span>
						<span>
							<span class="font-medium">Speakers:</span>
							{parseResult.speakers.length}
						</span>
						<span>
							<span class="font-medium">Turns:</span>
							{parseResult.turns.length}
						</span>
						{#if parseResult.hasTimestamps}
							<span class="badge badge-sm badge-success">Has timestamps</span>
						{/if}
					</div>
				</div>
			{/if}

			{#if parseResult && parseResult.continuationLineCount > 0}
				<div class="mt-3 px-3 py-2 bg-warning/10 border border-warning/30 rounded-lg flex-shrink-0">
					<p class="text-sm text-warning-content">
						{parseResult.continuationLineCount} of {parseResult.totalLineCount} lines couldn't be parsed as dialogue and were appended to the previous
						speaker's turn.
						{#if selectedFormat === 'auto'}
							Try selecting a specific format above.
						{/if}
					</p>
				</div>
			{/if}

			{#if parseResult?.turns.length}
				<div class="mt-4 flex-1 overflow-hidden flex flex-col min-h-0">
					<p class="text-sm font-medium mb-2 flex-shrink-0">Preview:</p>
					<div class="overflow-y-auto flex-1 border rounded-lg p-2 bg-base-100">
						<div class="space-y-2">
							{#each parseResult.turns.slice(0, 10) as turn}
								<div class="text-sm">
									<span class="font-medium text-primary">{toTitleCase(turn.speaker)}:</span>
									<span class="text-base-content">{truncate(turn.content, 100)}</span>
									{#if turn.startTime !== null}
										<span class="text-xs text-gray-400 ml-1">
											({formatTimeAuto(turn.startTime)})
										</span>
									{/if}
								</div>
							{/each}
							{#if parseResult.turns.length > 10}
								<div class="text-sm text-gray-500 italic">
									... and {parseResult.turns.length - 10} more turns
								</div>
							{/if}
						</div>
					</div>
				</div>
			{:else if inputText.trim() && parseResult}
				<div class="mt-4 p-4 bg-warning/10 border border-warning rounded-lg">
					<p class="text-sm text-warning">No turns could be parsed. Try selecting a different format above.</p>
				</div>
			{/if}

			<div class="modal-action flex-shrink-0">
				<button class="btn" onclick={close}>Cancel</button>
				<button class="btn btn-primary" onclick={handleImport} disabled={!parseResult?.turns.length}> Import </button>
			</div>
		</div>
	</div>
{/if}
