<script lang="ts">
	import { writable } from 'svelte/store';
	export let isModalOpen = writable(false);

	function openGoogleForm() {
		window.open('https://forms.gle/M1gvdgSvdH9yXAABA', '_blank');
	}
</script>

{#if $isModalOpen}
	<input type="checkbox" bind:checked={$isModalOpen} id="my-modal" class="modal-toggle" />
	<div class="modal">
		<div class="modal-box max-w-7xl">
			<div class="hero p-10">
				<div class="hero-content text-left">
					<div class="">
						<h1 class="text-5xl font-bold pb-8 text-center">TRANSCRIPT EXPLORER</h1>
						<p class="py-3 text-xl text-justify">
							Welcome to Transcript Explorer! Transcript Explorer is an open-source tool for dynamically visualizing transcripts linked to video. 
							Explore your data with various visualization techniques, including distribution diagrams, turn charts, and contribution clouds. 
							Animate, filter, and interact with transcript data, shift seamlessly between video clips, and rescale data using the interactive timeline. 
							Use the top menu to explore sample datasets or upload your own and start exploring!
						</p>
						<div class="flex flex-row justify-center flex-wrap gap-4 my-2">
							<a href="https://youtu.be/_2_3ilMm4pQ" target="_blank" class="btn bg-gray-300 text-black">Watch Demo Video</a>
							<a href="/images/data_formatting_guide.pdf" target="_blank" class="btn bg-gray-300 text-black">Data Formatting Guide</a>
							<a href="https://static1.squarespace.com/static/64f88a928f65ec467d0ea422/t/67c8e6d39309be2f9ea36ffd/1741219552860/CHI_EVAT-TranscriptExplorer.pdf" target="_blank" class="btn bg-gray-300 text-black">View Publication</a>
							<a href="https://forms.gle/3i1F74V6cy5Q8RHv5" target="_blank" class="btn bg-gray-300 text-black">Share Feedback</a>
						</div>
						<p class="pt-3 pb-6 text-justify">
							Transcript Explorer software is an <a href="https://github.com/BenRydal/transcript-explorer" class="text-blue-500 underline" target="_blank" rel="noopener noreferrer">open-source project</a>
							built with Svelte, JavaScript and p5.js licensed under the GNU General Public License Version 3.0. It is
							developed by Ben Rydal Shapiro, Edwin Zhao, Rogers Hall, Arpit Mathur, and contributors with support from the National Science Foundation #1623690 and #2100784. 
							Example data is from the <a href="https://www.timssvideo.com" class="text-blue-500 underline" target="_blank">TIMSS 1999 Video Study</a> and 
							<a href="https://deepblue.lib.umich.edu/handle/2027.42/65013" class="text-blue-500 underline" target="_blank">the Case of Sean Numbers</a> from Mathematics Teaching and Learning to Teach (MTLT), University of Michigan (2010) used with special permission.
							If using Transcript Explorer in your research, kindly reference: 
						</p>

						<p class="pt-1 pb-6 italic text-justify">
							Shapiro, B.R., Hall, R., Mathur, A. & Zhao, E. (2025). Exploratory Visual Analysis of Transcripts for Interaction Analysis in Human-Computer Interaction. 
							In CHI Conference on Human Factors in Computing Systems (CHI ’25), April 26–May 01, 2025, Yokohama, Japan. ACM, New York, NY, USA, 17 pages.
							<a href="https://doi.org/10.1145/3706598.3713490" class="text-blue-500 underline" target="_blank">https://doi.org/10.1145/3706598.3713490</a>
						</p>

						<div class="modal-action flex justify-center">
							<button class="btn btn-primary" on:click={() => ($isModalOpen = false)}>
								Get Started
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
