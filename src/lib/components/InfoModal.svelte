<script lang="ts">
	import { writable } from 'svelte/store';
	export let isModalOpen = writable(false);
</script>

{#if $isModalOpen}
	<div class="modal modal-open">
		<div class="modal-box max-w-4xl py-10 px-12">
			<!-- Header -->
			<div class="text-center mb-8">
				<h1 class="text-4xl font-bold text-gray-800">Transcript Explorer</h1>
			</div>

			<!-- Main description -->
			<p class="text-xl text-gray-600 leading-relaxed mb-8">
				Welcome to Transcript Explorer, an open-source tool to dynamically visualize and edit transcripts linked to video. Animate through
				conversations, filter by speaker, edit transcript data, and click visualizations to interact with video in different ways. Select an example
				dataset or upload your own to get started.
			</p>

			<!-- Privacy note -->
			<div class="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-8">
				<p class="text-green-800">
					<strong>Privacy:</strong> Everything runs in your browser. No data is uploaded or transmitted.
				</p>
			</div>

			<!-- Action buttons -->
			<div class="flex flex-wrap justify-center gap-3 mb-8">
				<a href="https://youtu.be/_2_3ilMm4pQ" target="_blank" class="btn btn-outline"> Watch Demo </a>
				<a href="/images/data_formatting_guide.pdf" target="_blank" class="btn btn-outline"> Data Format Guide </a>
				<a href="https://forms.gle/3i1F74V6cy5Q8RHv5" target="_blank" class="btn btn-outline"> Share Feedback </a>
			</div>

			<!-- Collapsible credits section -->
			<details class="mb-6">
				<summary class="cursor-pointer text-sm text-gray-500 hover:text-gray-700"> Credits & Citation </summary>
				<div class="mt-3 text-sm text-gray-600 space-y-3">
					<p>
						<a href="https://github.com/BenRydal/transcript-explorer" class="text-blue-600 hover:underline" target="_blank">Open-source</a> project
						built with Svelte and p5.js. Developed by Ben Rydal Shapiro, Edwin Zhao, Rogers Hall, Arpit Mathur, and contributors. Supported by NSF
						#1623690 and #2100784. Example data is from the
						<a href="https://www.timssvideo.com" class="text-blue-600 hover:underline" target="_blank">TIMSS 1999 Video Study</a>,
						<a href="https://deepblue.lib.umich.edu/handle/2027.42/65013" class="text-blue-600 hover:underline" target="_blank"
							>Case of Sean Numbers</a
						> (U. Michigan). If using Transcript Explorer in your research, please cite:
					</p>
					<p class="italic bg-gray-50 p-3 rounded text-xs">
						Shapiro, B.R., Hall, R., Mathur, A. & Zhao, E. (2025). Exploratory Visual Analysis of Transcripts for Interaction Analysis in
						Human-Computer Interaction. In CHI Conference on Human Factors in Computing Systems (CHI '25), April 26–May 01, 2025, Yokohama, Japan.
						ACM, New York, NY, USA, 17 pages.
						<a href="https://doi.org/10.1145/3706598.3713490" class="text-blue-600 hover:underline" target="_blank"
							>https://doi.org/10.1145/3706598.3713490</a
						>
					</p>
				</div>
			</details>

			<!-- Get Started button -->
			<div class="flex justify-center">
				<button class="btn btn-primary px-8" on:click={() => ($isModalOpen = false)}> Get Started </button>
			</div>
		</div>
	</div>
{/if}
