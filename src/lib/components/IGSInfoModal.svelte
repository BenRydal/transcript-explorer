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
						<p class="py-3 text-lg">
							Welcome to the Transcript Explorer! Transcript Explorer is an open-source tool to dynamically visualize transcripts linked to video. Transcript data can be displayed
							and interacted with using a variety of techniques that each provide different ways to interact with video.
							Use the top menu to explore sample datasets or upload your own data. Interact with data by selecting different visualization techniques, animating
							and filtering data, watching video, and rescaling data with the interactive timeline.
						</p>
						<div class="flex flex-row justify-center flex-wrap gap-4 my-2">
							<a href="https://youtu.be/_2_3ilMm4pQ" target="_blank" class="btn bg-gray-300 text-black">Watch Demo Video</a>
							<a href="/images/data_formatting_guide.pdf" target="_blank" class="btn bg-gray-300 text-black">Data Formatting Guide</a>
							<a href="https://github.com/BenRydal/transcript-explorer" target="_blank" class="btn bg-gray-300 text-black">Contribute</a>
							<a href="https://doi.org/10.1145/3706598.3713490" target="_blank" class="btn bg-gray-300 text-black">Reference</a>
						</div>
						<p class="pt-3 pb-6 italic text-center">
							Transcript Explorer software is an open-source project built with Svelte, JavaScript and p5.js licensed under the GNU General Public License Version 2.0. It is
							developed by Ben Rydal Shapiro, Edwin Zhao and contributors with support from the National Science Foundation #1623690 and #2100784.
						</p>
						<div class="modal-action flex justify-center">
							<a href="https://forms.gle/M1gvdgSvdH9yXAABA" target="_blank" class="btn bg-gray-300 text-black">Feedback</a>
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
