<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { TranscriptionProgress, TranscriptionResult } from '$lib/core/transcription-service';
	import { transcribeVideo } from '$lib/core/transcription-service';

	export let isOpen = false;
	export let videoFile: File | null = null;
	export let videoDuration: number = 0;

	const dispatch = createEventDispatcher<{
		close: void;
		complete: TranscriptionResult;
	}>();

	let progress: TranscriptionProgress = {
		status: 'loading-model',
		progress: 0,
		message: 'Ready to transcribe'
	};

	let isTranscribing = false;
	let error: string | null = null;

	async function startTranscription() {
		if (!videoFile) return;

		isTranscribing = true;
		error = null;

		try {
			const result = await transcribeVideo(videoFile, (p) => {
				progress = p;
			});

			dispatch('complete', result);
			isOpen = false;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Transcription failed';
			isTranscribing = false;
		}
	}

	function handleClose() {
		if (!isTranscribing) {
			dispatch('close');
			isOpen = false;
		}
	}
</script>

{#if isOpen}
	<div
		class="modal modal-open"
		on:click|self={handleClose}
		on:keydown={(e) => {
			if (e.key === 'Escape' && !isTranscribing) handleClose();
		}}
	>
		<div class="modal-box max-w-lg">
			<div class="flex justify-between items-center mb-6">
				<h3 class="font-bold text-xl">🎙️ Auto-Transcribe Video</h3>
				{#if !isTranscribing}
					<button class="btn btn-circle btn-sm" on:click={handleClose}>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				{/if}
			</div>

			{#if !isTranscribing}
				<div class="space-y-4">
					<p class="text-gray-600">Generate a transcript from your video using AI. Runs entirely in your browser - no data is uploaded.</p>

					{#if videoFile}
						<div class="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
							<p><strong>File:</strong> {videoFile.name}</p>
							<p><strong>Duration:</strong> {Math.round(videoDuration)} seconds</p>
						</div>
					{/if}

					<p class="text-sm text-gray-500">
						💡 First use downloads a ~40MB AI model (cached for future use). Speaker names default to "SPEAKER 1" and can be edited after.
					</p>
				</div>
			{:else}
				<div class="space-y-4">
					<p class="text-center font-medium">{progress.message}</p>
					<progress class="progress progress-primary w-full" value={progress.progress} max="100"></progress>
					<p class="text-center text-sm text-gray-500">⏳ This may take a few minutes depending on video length.</p>
				</div>
			{/if}

			{#if error}
				<div class="alert alert-error mt-4">
					<span>{error}</span>
				</div>
			{/if}

			<div class="modal-action">
				{#if !isTranscribing}
					<button class="btn btn-ghost" on:click={handleClose}>Cancel</button>
					<button class="btn btn-primary" on:click={startTranscription} disabled={!videoFile}> Start Transcription </button>
				{/if}
			</div>
		</div>
	</div>
{/if}
