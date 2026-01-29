<script lang="ts">
	import type { TranscriptionProgress, TranscriptionResult } from '$lib/core/transcription-service';
	import { transcribeVideo } from '$lib/core/transcription-service';

	interface Props {
		isOpen?: boolean;
		videoFile?: File | null;
		videoDuration?: number;
		onclose?: () => void;
		oncomplete?: (result: TranscriptionResult) => void;
	}

	let { isOpen = $bindable(false), videoFile = null, videoDuration = 0, onclose, oncomplete }: Props = $props();

	let progress: TranscriptionProgress = $state({
		status: 'loading-model',
		progress: 0,
		message: 'Ready to transcribe'
	});

	let isTranscribing = $state(false);
	let error: string | null = $state(null);

	async function startTranscription() {
		if (!videoFile) return;

		isTranscribing = true;
		error = null;

		try {
			const result = await transcribeVideo(videoFile, (p) => {
				progress = p;
			});

			oncomplete?.(result);
			isOpen = false;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Transcription failed';
			isTranscribing = false;
		}
	}

	function handleClose() {
		if (!isTranscribing) {
			onclose?.();
			isOpen = false;
		}
	}
</script>

{#if isOpen}
	<div
		class="modal modal-open"
		onclick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
		onkeydown={(e) => {
			if (e.key === 'Escape' && !isTranscribing) handleClose();
		}}
	>
		<div class="modal-box max-w-lg">
			<div class="flex justify-between items-center mb-6">
				<h3 class="font-bold text-xl">🎙️ Auto-Transcribe Video</h3>
				{#if !isTranscribing}
					<button class="btn btn-circle btn-sm" onclick={handleClose}>
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
					<button class="btn btn-ghost" onclick={handleClose}>Cancel</button>
					<button class="btn btn-primary" onclick={startTranscription} disabled={!videoFile}> Start Transcription </button>
				{/if}
			</div>
		</div>
	</div>
{/if}
