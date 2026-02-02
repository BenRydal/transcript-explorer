<script lang="ts">
	import { writable, type Writable } from 'svelte/store';
	import { X, Lightbulb, CirclePlay, CloudUpload, Video, Mic, Pencil, MessageSquare } from '@lucide/svelte';

	interface Props {
		isModalOpen?: Writable<boolean>;
		onLoadExample?: ((exampleId: string) => void) | null;
		onOpenUpload?: (() => void) | null;
		onOpenPaste?: (() => void) | null;
		onStartTour?: (() => void) | null;
	}

	let { isModalOpen = writable(false), onLoadExample = null, onOpenUpload = null, onOpenPaste = null, onStartTour = null }: Props = $props();

	let activeTab: 'start' | 'import' | 'create' = $state('start');

	const tabs = [
		{ id: 'start', label: 'Get Started' },
		{ id: 'import', label: 'Import Transcript' },
		{ id: 'create', label: 'Create Transcript' }
	] as const;

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

	function closeAndRun(fn: (() => void) | null) {
		fn?.();
		$isModalOpen = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') $isModalOpen = false;
	}
</script>

{#if $isModalOpen}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="modal modal-open"
		onclick={(e) => {
			if (e.target === e.currentTarget) $isModalOpen = false;
		}}
		onkeydown={handleKeydown}
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
							<p class="text-blue-100 text-lg">Visualize, explore, and create transcripts linked to video</p>
						</div>
						<button
							class="btn btn-circle btn-ghost btn-sm text-white hover:bg-white/20 flex-shrink-0"
							onclick={() => ($isModalOpen = false)}
							aria-label="Close modal"
						>
							<X size={24} />
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
							onclick={() => (activeTab = tab.id)}
						>
							{tab.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Tab Content -->
			<div class="px-8 py-6">
				{#if activeTab === 'start'}
					<!-- Get Started Tab -->
					<div class="flex gap-4 mb-6">
						<button
							onclick={() => closeAndRun(onStartTour)}
							class="flex-1 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4 hover:border-amber-400 transition-all group text-left"
						>
							<div class="flex items-center gap-3">
								<div
									class="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center group-hover:bg-amber-200 transition-colors text-amber-600"
								>
									<Lightbulb size={20} />
								</div>
								<div>
									<h3 class="font-semibold text-gray-800 group-hover:text-amber-700">Take a Guided Tour</h3>
									<p class="text-sm text-gray-500">Interactive walkthrough of the interface</p>
								</div>
							</div>
						</button>
						<a
							href="https://youtu.be/_2_3ilMm4pQ"
							target="_blank"
							rel="noopener noreferrer"
							class="flex-1 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 hover:border-blue-400 transition-all group text-left"
						>
							<div class="flex items-center gap-3">
								<div
									class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors text-blue-600"
								>
									<CirclePlay size={20} />
								</div>
								<div>
									<h3 class="font-semibold text-gray-800 group-hover:text-blue-700">Watch Demo Video</h3>
									<p class="text-sm text-gray-500">See the tool in action (3 min)</p>
								</div>
							</div>
						</a>
					</div>

					<h3 class="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Or dive in with an example</h3>
					<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
						{#each examples as example}
							<button
								class="text-left border border-gray-200 rounded-lg hover:border-amber-400 hover:bg-amber-50 transition-all group overflow-hidden flex"
								onclick={() => closeAndRun(() => onLoadExample?.(example.id))}
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
				{:else if activeTab === 'import'}
					<!-- Import Transcript Tab -->
					<div class="grid grid-cols-2 gap-4 mb-5">
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
							<p class="text-xs text-gray-500 mt-2">Times are optional and can be in seconds, MM:SS, or HH:MM:SS</p>
						</div>
						<div class="bg-gray-50 rounded-lg p-4">
							<h4 class="font-medium text-gray-700 mb-2">TXT format</h4>
							<div class="bg-white border border-gray-200 rounded p-2 font-mono text-xs">
								<div>Teacher: Good morning</div>
								<div>Student 1: Hi!</div>
								<div>Teacher: Let's begin</div>
							</div>
							<p class="text-xs text-gray-500 mt-2">Each line: Speaker, colon, then content</p>
						</div>
						<div class="bg-gray-50 rounded-lg p-4">
							<h4 class="font-medium text-gray-700 mb-2">SRT / VTT subtitles</h4>
							<div class="bg-white border border-gray-200 rounded p-2 font-mono text-xs">
								<div class="text-gray-400">1</div>
								<div class="text-gray-400">00:00:01,000 --> 00:00:03,500</div>
								<div>Good morning class</div>
								<div class="mt-1 text-gray-400">2</div>
								<div class="text-gray-400">00:00:04,000 --> 00:00:05,000</div>
								<div>Hi teacher!</div>
							</div>
						</div>
						<div class="bg-gray-50 rounded-lg p-4">
							<h4 class="font-medium text-gray-700 mb-2">Paste text</h4>
							<div class="bg-white border border-gray-200 rounded p-2 font-mono text-xs">
								<div>Alice: Hello there</div>
								<div>Bob: Hi Alice!</div>
								<div class="text-gray-400 mt-1">— or with timestamps —</div>
								<div>[0:01] Alice: Hello there</div>
								<div>[0:03] Bob: Hi Alice!</div>
							</div>
							<p class="text-xs text-gray-500 mt-2">Auto-detects many common formats</p>
						</div>
					</div>

					<div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
						<div class="flex items-start gap-3">
							<Video size={20} class="text-blue-600 flex-shrink-0 mt-0.5" />
							<div>
								<h4 class="font-medium text-blue-800 mb-1">Link with video</h4>
								<p class="text-sm text-blue-700">
									If your transcript has timestamps, you can also upload an MP4 or paste a YouTube link to sync visualizations with video playback.
								</p>
							</div>
						</div>
					</div>

					<div class="flex gap-3">
						<button class="btn btn-primary" onclick={() => closeAndRun(onOpenUpload)}>
							<CloudUpload size={20} class="mr-2" />
							Upload Files
						</button>
						<button class="btn btn-outline" onclick={() => closeAndRun(onOpenPaste)}>
							<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
								/>
							</svg>
							Paste Text
						</button>
					</div>
				{:else if activeTab === 'create'}
					<!-- Create Transcript Tab -->
					<p class="text-gray-600 mb-5">Have a video but no transcript? Generate one automatically or transcribe it yourself.</p>

					<div class="space-y-4">
						<!-- Auto-Transcribe Option -->
						<div class="border border-gray-200 rounded-lg p-5 hover:border-purple-300 transition-colors">
							<div class="flex items-start gap-4">
								<div class="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 text-purple-600">
									<Mic size={24} />
								</div>
								<div class="flex-1">
									<h4 class="font-semibold text-gray-800 mb-1">Auto-Transcribe with AI</h4>
									<p class="text-sm text-gray-600 mb-3">
										Upload an MP4 video and let AI generate a transcript automatically. Everything runs in your browser—no data is sent anywhere.
									</p>
									<div class="text-xs text-gray-500 space-y-1 mb-4">
										<p><strong>How it works:</strong> Upload video → Click "Auto-Transcribe" → Edit result in the transcript editor</p>
										<p><strong>Note:</strong> English only. All speech is assigned to one speaker—use the editor to assign speakers afterward.</p>
									</div>
									<button class="btn btn-sm btn-primary" onclick={() => closeAndRun(onOpenUpload)}>
										<CloudUpload size={16} class="mr-1" />
										Upload Video
									</button>
								</div>
							</div>
						</div>

						<!-- Manual Transcribe Option -->
						<div class="border border-gray-200 rounded-lg p-5 hover:border-emerald-300 transition-colors">
							<div class="flex items-start gap-4">
								<div class="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-600">
									<Pencil size={24} />
								</div>
								<div class="flex-1">
									<h4 class="font-semibold text-gray-800 mb-1">Transcribe Manually</h4>
									<p class="text-sm text-gray-600 mb-3">
										Upload a video, then use Transcribe Mode—a focused workspace designed for efficient manual transcription.
									</p>
									<div class="text-xs text-gray-500 space-y-1 mb-4">
										<p><strong>How it works:</strong> Upload video → Click "Transcribe" in the navbar → Type while controlling playback</p>
										<p><strong>Keyboard shortcuts:</strong> Space to pause, arrow keys to skip, capture timestamps as you go</p>
									</div>
									<button class="btn btn-sm btn-primary" onclick={() => closeAndRun(onOpenUpload)}>
										<CloudUpload size={16} class="mr-1" />
										Upload Video
									</button>
								</div>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="bg-gray-50 px-8 py-4 flex flex-wrap items-center justify-between gap-4 border-t border-gray-200">
				<div class="flex flex-wrap gap-3">
					<a
						href="https://forms.gle/3i1F74V6cy5Q8RHv5"
						target="_blank"
						rel="noopener noreferrer"
						class="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"
					>
						<MessageSquare size={16} />
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
