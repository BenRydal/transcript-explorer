<script lang="ts">
	import { CloudUpload, ArrowLeft, X, Check, CircleAlert } from '@lucide/svelte';
	import { extractYouTubeVideoId } from '$lib/core/url-utils';
	import { isRequired, allRequiredMapped } from '$lib/core/column-mapper';
	import type { CSVPreview } from '../../models/csv-preview';
	import type { TimingMode } from '../../models/transcript';

	interface Props {
		isOpen?: boolean;
		isDraggingOver?: boolean;
		pendingVideoFile?: File | null;
		uploadedFiles?: Array<{ name: string; type: string; status: string; error?: string }>;
		csvPreview?: CSVPreview | null;
		ondrop?: (e: DragEvent) => void;
		ondragover?: (e: DragEvent) => void;
		ondragleave?: () => void;
		onopenFileDialog?: () => void;
		onopenPasteModal?: () => void;
		onyoutubeUrl?: (videoId: string) => void;
		onstartTranscription?: () => void;
		onclearFiles?: () => void;
		onconfirmImport?: () => void;
		oncancelPreview?: () => void;
		oncolumnMappingChange?: (expected: string, csvColumn: string | null) => void;
	}

	let {
		isOpen = $bindable(false),
		isDraggingOver = false,
		pendingVideoFile = null,
		uploadedFiles = [],
		csvPreview = null,
		ondrop,
		ondragover,
		ondragleave,
		onopenFileDialog,
		onopenPasteModal,
		onyoutubeUrl,
		onstartTranscription,
		onclearFiles,
		onconfirmImport,
		oncancelPreview,
		oncolumnMappingChange
	}: Props = $props();

	function getEffectiveMatch(match: ColumnMatch): string | null {
		if (!csvPreview) return match.matched;
		const override = csvPreview.columnOverrides[match.expected];
		return override !== undefined ? override : match.matched;
	}

	function canImport(): boolean {
		if (!csvPreview) return false;
		return allRequiredMapped(csvPreview.columnMatches, csvPreview.columnOverrides);
	}

	let youtubeUrl = $state('');
	let youtubeError = $state('');

	const timingModeLabels: Record<TimingMode, string> = {
		untimed: 'Untimed',
		startOnly: 'Start times only',
		startEnd: 'Start & end times'
	};

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (csvPreview) {
				oncancelPreview?.();
			} else {
				isOpen = false;
			}
		}
	}

	function handleDropzoneKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') onopenFileDialog?.();
	}

	function handleYouTubeSubmit() {
		const videoId = extractYouTubeVideoId(youtubeUrl);
		if (videoId) {
			onyoutubeUrl?.(videoId);
			youtubeUrl = '';
			isOpen = false;
		} else {
			youtubeError = 'Invalid YouTube URL';
		}
	}

	function formatCellValue(value: unknown): string {
		if (value == null || value === '') return '\u2014';
		return String(value);
	}
</script>

{#if isOpen}
	<div
		class="modal modal-open"
		onclick={(e) => {
			if (e.target === e.currentTarget) {
				if (csvPreview) oncancelPreview?.();
				else isOpen = false;
			}
		}}
		onkeydown={handleKeydown}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
	>
		<div class="modal-box w-11/12 max-w-lg">
			{#if csvPreview}
				<!-- CSV Preview -->
				<div class="flex justify-between items-center mb-4">
					<div class="flex items-center gap-2">
						<button class="btn btn-ghost btn-sm btn-square" onclick={() => oncancelPreview?.()} aria-label="Back">
							<ArrowLeft size={18} />
						</button>
						<h3 class="font-bold text-lg truncate max-w-[300px]" title={csvPreview.fileName}>Preview: {csvPreview.fileName}</h3>
					</div>
					<button
						class="btn btn-circle btn-sm"
						onclick={() => {
							oncancelPreview?.();
							isOpen = false;
						}}
						aria-label="Close"
					>
						<X size={20} />
					</button>
				</div>

				<!-- Error banner (non-column errors only) -->
				{#if csvPreview.error}
					<div class="alert alert-error mb-3 py-2">
						<CircleAlert size={16} />
						<span class="text-sm">{csvPreview.error}</span>
					</div>
				{/if}

				<!-- Summary -->
				{#if csvPreview.speakerCount > 0}
					<div class="text-sm text-gray-600 mb-3">
						{csvPreview.speakerCount} speaker{csvPreview.speakerCount !== 1 ? 's' : ''},
						{csvPreview.turnCount} turn{csvPreview.turnCount !== 1 ? 's' : ''},
						{csvPreview.wordCount} word{csvPreview.wordCount !== 1 ? 's' : ''}
						{#if csvPreview.timingMode}
							&mdash; Timing: {timingModeLabels[csvPreview.timingMode]}
						{/if}
					</div>
				{/if}

				<!-- Column mapping -->
				<div class="flex flex-col gap-2 mb-4">
					{#each csvPreview.columnMatches as match}
						{@const effective = getEffectiveMatch(match)}
						{@const required = isRequired(match.expected)}
						<div class="flex items-center gap-2">
							<span class="text-sm font-medium w-16">{match.expected}</span>
							{#if match.isExact && !(match.expected in csvPreview.columnOverrides)}
								<!-- Exact match: green badge -->
								<span class="badge badge-success badge-sm gap-1">
									<Check size={12} />
									{match.expected}
								</span>
							{:else}
								<!-- Fuzzy match or no match: show dropdown -->
								<select
									class="select select-bordered select-xs flex-1 max-w-48"
									value={effective ?? ''}
									aria-label="Map CSV column to {match.expected}"
									onchange={(e) => {
										const val = (e.target as HTMLSelectElement).value;
										oncolumnMappingChange?.(match.expected, val || null);
									}}
								>
									<option value="">{required ? '— Select column —' : '— Skip —'}</option>
									{#each csvPreview.allColumns as col}
										<option value={col}>{col}</option>
									{/each}
								</select>
								{#if effective && !match.isExact}
									<span class="text-xs text-gray-500">({Math.round(match.score * 100)}% match)</span>
								{/if}
								{#if !effective && required}
									<span class="text-xs text-error">required</span>
								{/if}
							{/if}
						</div>
					{/each}
				</div>

				<!-- Preview table -->
				{@const mappedCsvCols = new Set(csvPreview.columnMatches.map((m) => getEffectiveMatch(m)).filter(Boolean))}
				<div class="overflow-x-auto border rounded-lg max-h-56">
					<table class="table table-xs table-pin-rows">
						<thead>
							<tr>
								{#each csvPreview.allColumns as col}
									<th class={!mappedCsvCols.has(col) ? 'text-gray-400' : ''}>{col}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each csvPreview.rawRows as row}
								<tr>
									{#each csvPreview.allColumns as col}
										<td class={!mappedCsvCols.has(col) ? 'text-gray-400' : ''}>
											<span class="max-w-[200px] truncate block" title={formatCellValue(row[col])}>
												{formatCellValue(row[col])}
											</span>
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if csvPreview.turnCount > csvPreview.rawRows.length}
					<p class="text-xs text-gray-400 mt-1">Showing first {csvPreview.rawRows.length} of {csvPreview.turnCount} rows</p>
				{/if}

				<!-- Actions -->
				<div class="modal-action">
					<button class="btn" onclick={() => oncancelPreview?.()}>Back</button>
					<button class="btn btn-primary" onclick={() => onconfirmImport?.()} disabled={!canImport()}>Import</button>
				</div>
			{:else}
				<!-- Normal upload UI -->
				<div class="flex justify-between mb-4">
					<h3 class="font-bold text-lg">Upload Files</h3>
					<button class="btn btn-circle btn-sm" onclick={() => (isOpen = false)} aria-label="Close">
						<X size={20} />
					</button>
				</div>

				<!-- Drop zone -->
				<div
					class="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors {isDraggingOver
						? 'border-primary bg-primary/10'
						: 'border-gray-300 hover:border-gray-400'}"
					ondrop={(e) => {
						e.preventDefault();
						ondrop?.(e);
					}}
					ondragover={(e) => {
						e.preventDefault();
						ondragover?.(e);
					}}
					ondragleave={() => ondragleave?.()}
					onclick={() => onopenFileDialog?.()}
					onkeydown={handleDropzoneKeydown}
					role="button"
					tabindex="0"
				>
					<div class="flex flex-col items-center gap-2">
						<CloudUpload size={48} class="text-gray-400" />
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
						<span class="badge badge-outline">.srt</span>
						<span class="badge badge-outline">.vtt</span>
						<span class="badge badge-outline">.mp4</span>
					</div>
					<p class="text-xs text-gray-500 mt-2">
						CSV/TXT files should contain transcript data with speaker and content columns. SRT/VTT subtitle files are also supported. MP4 files will
						be used as video overlay.
					</p>
				</div>

				<!-- Paste text option -->
				<div class="mt-4">
					<div class="divider text-sm text-gray-500">or</div>
					<button class="btn btn-outline btn-block" onclick={() => onopenPasteModal?.()}> Paste Transcript Text </button>
					<p class="text-xs text-gray-500 mt-2 text-center">Paste text directly and we'll detect the format automatically</p>
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
							oninput={() => (youtubeError = '')}
							onkeydown={(e) => e.key === 'Enter' && handleYouTubeSubmit()}
						/>
						<button class="btn btn-sm btn-primary" onclick={handleYouTubeSubmit} disabled={!youtubeUrl.trim()}> Load </button>
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
							onclick={() => {
								isOpen = false;
								onstartTranscription?.();
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
							<button class="btn btn-xs btn-ghost" onclick={() => onclearFiles?.()}>Clear</button>
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
											<Check size={20} class="text-success" />
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
					<button class="btn" onclick={() => (isOpen = false)}>Close</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
