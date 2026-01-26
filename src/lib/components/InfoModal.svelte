<script lang="ts">
	import { writable, type Writable } from 'svelte/store';
	import MdCloudUpload from 'svelte-icons/md/MdCloudUpload.svelte';

	export let isModalOpen: Writable<boolean> = writable(false);
	export let onLoadExample: ((exampleId: string) => void) | null = null;
	export let onOpenUpload: (() => void) | null = null;
	export let onStartTour: (() => void) | null = null;

	let activeTab: 'try' | 'upload' | 'transcribe' | 'create' = 'try';

	const tabs = [
		{ id: 'try', label: 'Try an Example' },
		{ id: 'upload', label: 'Upload Transcript' },
		{ id: 'transcribe', label: 'Auto-Transcribe' },
		{ id: 'create', label: 'Create Transcript' }
	];

	const visualizations = [
		{
			img: 'distribution-diagram',
			title: 'Distribution Diagram',
			desc: 'Each flower is a speaker. Size shows words spoken, height shows turns taken.'
		},
		{ img: 'turn-chart', title: 'Turn Chart', desc: 'Each ellipse is a turn. Width is duration, height is word count.' },
		{ img: 'contribution-cloud', title: 'Contribution Cloud', desc: 'Words appear in a paragraph. When repeated, the first instance grows larger.' },
		{ img: 'dashboard', title: 'Dashboard', desc: 'All visualizations combined.' }
	];

	const examples = [
		{
			id: 'example-1',
			title: 'Kindergarten Activity',
			description: 'A teacher and students explore how matter occupies space in a hands-on bilingual classroom activity',
			speakers: 9,
			duration: '2 min',
			thumb: '/images/thumbs/example-1.webp'
		},
		{
			id: 'example-3',
			title: '3rd Grade Classroom Discussion',
			description: 'Students debate whether 6 is odd or even.',
			speakers: 5,
			duration: '5 min',
			thumb: '/images/thumbs/example-2.webp'
		},
		{
			id: 'example-2',
			title: 'Museum Gallery Visit',
			description: 'A family of five visits a museum gallery featuring early country and bluegrass artists',
			speakers: 5,
			duration: '8 min',
			thumb: '/images/thumbs/example-3.webp'
		},
		{
			id: 'example-5',
			title: '2020 Presidential Debate',
			description: 'The inaugural 2020 presidential debate between Joe Biden and Donald Trump',
			speakers: 3,
			duration: '90 min',
			thumb: '/images/thumbs/example-5.webp'
		}
	];

	function handleExampleClick(exampleId: string) {
		onLoadExample?.(exampleId);
		$isModalOpen = false;
	}

	function handleUploadClick() {
		onOpenUpload?.();
		$isModalOpen = false;
	}

	function handleStartTour() {
		onStartTour?.();
		$isModalOpen = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') $isModalOpen = false;
	}
</script>

{#if $isModalOpen}
	<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
	<div
		class="modal modal-open"
		on:click|self={() => ($isModalOpen = false)}
		on:keydown={handleKeydown}
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
	>
		<div class="modal-box max-w-4xl max-h-[90vh] p-0 overflow-y-auto">
			<!-- Header -->
			<div class="relative px-8 py-6 overflow-hidden">
				<div class="absolute inset-0 bg-cover bg-center" style="background-image: url(/images/thumbs-modes/dashboard.webp);"></div>
				<div class="absolute inset-0 bg-blue-950/85"></div>
				<div class="relative z-10">
					<div class="flex justify-between items-start">
						<div class="flex-1 pr-8">
							<h1 id="modal-title" class="text-3xl font-bold text-white italic mb-2">Transcript Explorer</h1>
							<p class="text-blue-100 text-lg">An open-source tool to dynamically visualize and explore transcripts linked to video</p>
						</div>
						<button
							class="btn btn-circle btn-ghost btn-sm text-white hover:bg-white/20 flex-shrink-0"
							on:click={() => ($isModalOpen = false)}
							aria-label="Close modal"
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
					<div
						class="mt-4 inline-flex items-center gap-2 bg-emerald-400/20 text-emerald-200 rounded-full px-3 py-1 text-sm border border-emerald-400/30"
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
							/>
						</svg>
						<span>100% private — runs entirely in your browser</span>
					</div>
				</div>
			</div>

			<!-- Tabs -->
			<div class="border-b border-gray-200 bg-white">
				<div class="flex px-8" role="tablist">
					{#each tabs as tab}
						<button
							role="tab"
							aria-selected={activeTab === tab.id}
							class="px-4 py-3 text-sm font-medium border-b-2 transition-colors {activeTab === tab.id
								? 'border-gray-800 text-gray-800'
								: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
							on:click={() => (activeTab = tab.id)}
						>
							{tab.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Tab Content -->
			<div class="px-8 py-6">
				{#if activeTab === 'try'}
					<div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
						{#each examples as example}
							<button
								class="text-left border border-gray-200 rounded-lg hover:border-amber-400 hover:bg-amber-50 transition-all group overflow-hidden flex"
								on:click={() => handleExampleClick(example.id)}
							>
								<img src={example.thumb} alt={example.title} class="w-24 h-24 object-cover flex-shrink-0" />
								<div class="p-3 flex flex-col justify-center">
									<h3 class="font-semibold text-gray-800 group-hover:text-amber-700 mb-1 text-sm">{example.title}</h3>
									<p class="text-xs text-gray-500 mb-1 line-clamp-2">{example.description}</p>
									<div class="flex gap-2 text-xs text-gray-400">
										<span>{example.speakers} speakers</span>
										<span>{example.duration}</span>
									</div>
								</div>
							</button>
						{/each}
					</div>

					<div class="border-t border-gray-100 pt-5">
						<p class="text-sm text-gray-500 mb-3">4 visualization modes to explore your data:</p>
						<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
							{#each visualizations as viz}
								<div class="text-center">
									<img src="/images/thumbs-modes/{viz.img}.webp" alt={viz.title} class="rounded border border-gray-200 mb-1 w-full" />
									<span class="text-xs font-medium text-gray-700">{viz.title}</span>
									<p class="text-[10px] text-gray-400 mt-0.5">{viz.desc}</p>
								</div>
							{/each}
						</div>
					</div>
				{:else if activeTab === 'upload'}
					<div class="space-y-6">
						<p class="text-gray-600">
							CSV or TXT files with conversation data. If transcript has start times, add MP4 video to link transcript with video.
						</p>
						<button class="btn btn-primary" on:click={handleUploadClick}>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
								/>
							</svg>
							Open Upload Dialog
						</button>
						<div class="grid grid-cols-2 gap-4">
							<div class="bg-gray-50 rounded-lg p-4">
								<h4 class="font-medium text-gray-700 mb-2">CSV format</h4>
								<div class="bg-white border border-gray-200 rounded overflow-hidden">
									<table class="w-full text-xs">
										<thead class="bg-gray-100">
											<tr>
												<th class="px-2 py-1 text-left font-medium text-gray-700">speaker</th>
												<th class="px-2 py-1 text-left font-medium text-gray-700">content</th>
												<th class="px-2 py-1 text-left font-medium text-gray-400">start <span class="font-normal italic">(optional)</span></th>
												<th class="px-2 py-1 text-left font-medium text-gray-400">end <span class="font-normal italic">(optional)</span></th>
											</tr>
										</thead>
										<tbody class="font-mono">
											<tr class="border-t border-gray-100">
												<td class="px-2 py-1">Teacher</td>
												<td class="px-2 py-1">Good morning</td>
												<td class="px-2 py-1 text-gray-400">0</td>
												<td class="px-2 py-1 text-gray-400">3</td>
											</tr>
											<tr class="border-t border-gray-100">
												<td class="px-2 py-1">Student</td>
												<td class="px-2 py-1">Hi!</td>
												<td class="px-2 py-1 text-gray-400">3</td>
												<td class="px-2 py-1 text-gray-400">4</td>
											</tr>
										</tbody>
									</table>
								</div>
								<p class="text-xs text-gray-500 mt-2"><strong>Times</strong> are optional and can be in seconds or HH:MM:SS format.</p>
							</div>
							<div class="bg-gray-50 rounded-lg p-4">
								<h4 class="font-medium text-gray-700 mb-2">TXT format</h4>
								<div class="bg-white border border-gray-200 rounded p-2 font-mono text-xs">
									<div>Teacher: Good morning</div>
									<div>Student 1: Hi!</div>
									<div>Teacher: Let's begin</div>
								</div>
								<p class="text-xs text-gray-500 mt-2"><strong>Each line:</strong> speaker name, colon, space, then what was said.</p>
							</div>
						</div>
					</div>
				{:else if activeTab === 'transcribe'}
					<div class="space-y-4">
						<p class="text-gray-600">Upload an MP4 video to generate a transcript using AI speech recognition.</p>
						<div class="flex items-center gap-2 text-gray-500">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
								/>
							</svg>
							<span class="text-sm">Everything runs in your browser—no data is sent anywhere.</span>
						</div>

						<div class="bg-purple-50 border border-purple-200 rounded-lg p-4">
							<h4 class="font-medium text-purple-800 mb-2">How it works</h4>
							<ol class="text-sm text-purple-700 space-y-2 list-decimal list-inside">
								<li>Upload an MP4 video file using the upload dialog</li>
								<li>Click "Auto-Transcribe" when prompted</li>
								<li>Wait while the AI processes your video</li>
								<li>Use the editor to edit and assign speakers to the AI-generated transcript</li>
							</ol>
						</div>

						<button class="btn btn-primary" on:click={handleUploadClick}>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
								/>
							</svg>
							Upload Video to Transcribe
						</button>

						<div class="text-sm text-gray-500">
							<p class="font-medium mb-1">Limitations:</p>
							<ul class="list-disc list-inside space-y-1 text-gray-400">
								<li>English only (uses Whisper tiny model)</li>
								<li>No speaker identification—all speech assigned to one speaker</li>
								<li>Best with clear audio and minimal background noise</li>
							</ul>
						</div>
					</div>
				{:else if activeTab === 'create'}
					<div class="space-y-4">
						<p class="text-gray-600">
							A focused workspace for manually transcribing video with keyboard shortcuts for efficient transcription. Switch between transcribe mode and visualization mode anytime to see your transcript come to life.
						</p>

						<div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
							<h4 class="font-medium text-blue-800 mb-3">How to use</h4>
							<ol class="text-sm text-blue-700 space-y-2 list-decimal list-inside">
								<li>Upload a video file</li>
								<li>Click the <strong>Transcribe</strong> button in the navbar to enter transcribe mode</li>
								<li>Use keyboard shortcuts to control playback while typing</li>
								<li>Add turns and assign speakers as you transcribe</li>
							</ol>
						</div>

						<button class="btn btn-primary" on:click={handleUploadClick}>
							<div class="w-5 h-5 mr-2"><MdCloudUpload /></div>
							Upload Video
						</button>
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="bg-gray-50 px-8 py-4 flex flex-wrap items-center justify-between gap-4 border-t border-gray-200">
				<div class="flex flex-wrap gap-3">
					<a
						href="https://youtu.be/_2_3ilMm4pQ"
						target="_blank"
						rel="noopener noreferrer"
						class="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
							/>
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						Watch Demo
					</a>
					<button on:click={handleStartTour} class="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-1">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
							/>
						</svg>
						Take a Tour
					</button>
					<a
						href="https://forms.gle/3i1F74V6cy5Q8RHv5"
						target="_blank"
						rel="noopener noreferrer"
						class="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
							/>
						</svg>
						Feedback
					</a>
					<a
						href="https://github.com/BenRydal/transcript-explorer"
						target="_blank"
						rel="noopener noreferrer"
						class="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
							<path
								d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
							/>
						</svg>
						Open Source
					</a>
				</div>

				<details class="relative">
					<summary class="cursor-pointer text-xs text-gray-400 hover:text-gray-600">Credits and Citation</summary>
					<div
						class="absolute right-0 bottom-full mb-2 text-xs text-gray-500 text-left w-[90vw] max-w-[450px] bg-white border border-gray-200 rounded-lg p-3 shadow-lg space-y-1"
					>
						<p>
							Example data from Mathematics Teaching and Learning to Teach (MTLT), University of Michigan (2010) and The Third International
							Mathematics and Science Study (TIMSS) 1999 Video Study.
						</p>
						<p>
							<strong>Citation:</strong> Shapiro, B.R., Hall, R., Mathur, A. & Zhao, E. (2025). Exploratory Visual Analysis of Transcripts for
							Interaction Analysis in HCI. CHI '25.
							<a href="https://doi.org/10.1145/3706598.3713490" class="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer"
								>doi.org/10.1145/3706598.3713490</a
							>
						</p>
					</div>
				</details>
			</div>
		</div>
	</div>
{/if}
