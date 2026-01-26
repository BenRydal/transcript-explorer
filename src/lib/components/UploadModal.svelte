<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import MdCloudUpload from 'svelte-icons/md/MdCloudUpload.svelte';
	import { extractYouTubeVideoId } from '$lib/core/url-utils';

	export let isOpen = false;
	export let isDraggingOver = false;
	export let pendingVideoFile: File | null = null;
	export let uploadedFiles: Array<{ name: string; type: string; status: string; error?: string }> = [];

	const dispatch = createEventDispatcher();

	let youtubeUrl = '';
	let youtubeError = '';

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') isOpen = false;
	}

	function handleDropzoneKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') dispatch('openFileDialog');
	}

	function handleYouTubeSubmit() {
		const videoId = extractYouTubeVideoId(youtubeUrl);
		if (videoId) {
			dispatch('youtubeUrl', videoId);
			youtubeUrl = '';
			isOpen = false;
		} else {
			youtubeError = 'Invalid YouTube URL';
		}
	}
</script>

{#if isOpen}
	<div class="modal modal-open" on:click|self={() => (isOpen = false)} on:keydown={handleKeydown} role="dialog" aria-modal="true">
		<div class="modal-box w-11/12 max-w-lg">
			<div class="flex justify-between mb-4">
				<h3 class="font-bold text-lg">Upload Files</h3>
				<button class="btn btn-circle btn-sm" on:click={() => (isOpen = false)}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Drop zone -->
			<div
				class="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors {isDraggingOver
					? 'border-primary bg-primary/10'
					: 'border-gray-300 hover:border-gray-400'}"
				on:drop|preventDefault={(e) => dispatch('drop', e)}
				on:dragover|preventDefault={(e) => dispatch('dragover', e)}
				on:dragleave={() => dispatch('dragleave')}
				on:click={() => dispatch('openFileDialog')}
				on:keydown={handleDropzoneKeydown}
				role="button"
				tabindex="0"
			>
				<div class="flex flex-col items-center gap-2">
					<div class="w-12 h-12 text-gray-400">
						<MdCloudUpload />
					</div>
					<p class="font-medium">Drag & drop files here</p>
					<p class="text-sm text-gray-500">or click to browse</p>
				</div>
			</div>

			<!-- Supported formats -->
			<div class="mt-4">
				<p class="text-sm font-medium mb-2">Supported formats:</p>
				<div class="flex flex-wrap gap-2">
					<span class="badge badge-outline">.csv</span>
					<span class="badge badge-outline">.txt</span>
					<span class="badge badge-outline">.mp4</span>
				</div>
				<p class="text-xs text-gray-500 mt-2">
					CSV/TXT files should contain transcript data with speaker and content columns. MP4 files will be used as video overlay.
				</p>
			</div>

			<!-- YouTube URL input -->
			<div class="mt-4">
				<div class="divider text-sm text-gray-500">or</div>
				<div class="flex gap-2">
					<input
						type="text"
						class="input input-bordered input-sm flex-1"
						placeholder="Paste YouTube URL"
						bind:value={youtubeUrl}
						on:input={() => (youtubeError = '')}
						on:keydown={(e) => e.key === 'Enter' && handleYouTubeSubmit()}
					/>
					<button class="btn btn-sm btn-primary" on:click={handleYouTubeSubmit} disabled={!youtubeUrl.trim()}>
						Load
					</button>
				</div>
				{#if youtubeError}
					<p class="text-error text-xs mt-1">{youtubeError}</p>
				{/if}
			</div>

			<!-- Auto-transcribe option -->
			{#if pendingVideoFile}
				<div class="mt-4 bg-purple-50 border border-purple-200 rounded-lg p-4">
					<p class="font-medium text-purple-800 mb-2">Auto-Transcribe Video</p>
					<p class="text-sm text-purple-700 mb-3">
						Generate a transcript automatically using AI. Runs entirely in your browser - no data is uploaded.
					</p>
					<button
						class="btn btn-sm btn-primary"
						on:click={() => {
							isOpen = false;
							dispatch('startTranscription');
						}}
					>
						Start Auto-Transcription
					</button>
				</div>
			{/if}

			<!-- Uploaded files list -->
			{#if uploadedFiles.length > 0}
				<div class="mt-4">
					<div class="flex justify-between items-center mb-2">
						<p class="text-sm font-medium">Uploaded files:</p>
						<button class="btn btn-xs btn-ghost" on:click={() => dispatch('clearFiles')}>Clear</button>
					</div>
					<div class="space-y-2 max-h-40 overflow-y-auto">
						{#each uploadedFiles as file}
							<div class="flex items-center justify-between p-2 bg-base-200 rounded">
								<div class="flex items-center gap-2">
									<span class="text-sm font-medium truncate max-w-[200px]">{file.name}</span>
									<span class="badge badge-sm">{file.type}</span>
								</div>
								<div>
									{#if file.status === 'pending'}
										<span class="text-gray-400">Pending</span>
									{:else if file.status === 'processing'}
										<span class="loading loading-spinner loading-sm"></span>
									{:else if file.status === 'done'}
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success" viewBox="0 0 20 20" fill="currentColor">
											<path
												fill-rule="evenodd"
												d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
												clip-rule="evenodd"
											/>
										</svg>
									{:else if file.status === 'error'}
										<span class="text-error text-sm" title={file.error}>Error</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<div class="modal-action">
				<button class="btn" on:click={() => (isOpen = false)}>Close</button>
			</div>
		</div>
	</div>
{/if}
