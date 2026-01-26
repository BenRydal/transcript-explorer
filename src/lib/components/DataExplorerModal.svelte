<script lang="ts">
	import TranscriptStore from '../../stores/transcriptStore';
	import UserStore from '../../stores/userStore';
	import { toTitleCase } from '$lib/core/string-utils';

	export let isOpen = false;

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') isOpen = false;
	}
</script>

{#if isOpen}
	<div class="modal modal-open" on:click|self={() => (isOpen = false)} on:keydown={handleKeydown} role="dialog" aria-modal="true">
		<div class="modal-box w-11/12 max-w-5xl">
			<div class="flex justify-between">
				<div class="flex flex-col">
					<h3 class="font-bold text-lg">Data Explorer</h3>
					<p>Here you will find detailed information on the data that you have uploaded.</p>
				</div>

				<button class="btn btn-circle btn-sm" on:click={() => (isOpen = false)}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="overflow-x-auto">
				<div class="flex flex-col">
					<div class="flex-col my-4">
						<h4 class="font-bold my-2">Transcript Statistics:</h4>
						<div class="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
							<div>
								<p><span class="font-semibold">Total Words:</span> {$TranscriptStore.totalNumOfWords}</p>
								<p><span class="font-semibold">Total Turns:</span> {$TranscriptStore.totalConversationTurns}</p>
								<p><span class="font-semibold">Total Time:</span> {$TranscriptStore.totalTimeInSeconds.toFixed(2)}s</p>
							</div>
							<div>
								<p><span class="font-semibold">Largest Turn Length:</span> {$TranscriptStore.largestTurnLength} words</p>
								<p>
									<span class="font-semibold">Most Frequent Word:</span> "{$TranscriptStore.mostFrequentWord}" ({$TranscriptStore.maxCountOfMostRepeatedWord}
									times)
								</p>
							</div>
						</div>
					</div>

					<h4 class="font-bold">Users:</h4>
					{#each $UserStore as user}
						<div class="my-4">
							<div tabindex="0" class="text-primary-content bg-[#e6e4df] collapse" aria-controls="collapse-content-{user.name}" role="button">
								<input type="checkbox" class="peer" />
								<div class="collapse-title font-semibold flex items-center">
									<div class="w-4 h-4 rounded-full mr-2" style="background-color: {user.color}"></div>
									{toTitleCase(user.name)}
								</div>

								<div class="collapse-content">
									<div class="grid grid-cols-2 gap-4 p-4">
										<div>
											<p>
												<span class="font-medium">Status:</span>
												<span class={user.enabled ? 'text-green-600' : 'text-red-600'}>
													{user.enabled ? 'Active' : 'Inactive'}
												</span>
											</p>
											<p><span class="font-medium">Color:</span> {user.color}</p>
										</div>
										<div>
											{#if $TranscriptStore.wordArray.length > 0}
												{@const userWords = $TranscriptStore.wordArray.filter((dp) => dp.speaker === user.name)}
												{@const userTurns = new Set(userWords.map((dp) => dp.turnNumber))}
												<p><span class="font-medium">Total Words:</span> {userWords.length}</p>
												<p><span class="font-medium">Total Turns:</span> {userTurns.size}</p>
											{/if}
										</div>
									</div>

									{#if $TranscriptStore.wordArray.length > 0}
										<div class="mt-4">
											<h2 class="font-medium mb-2">Recent Speech Samples:</h2>
											<div class="space-y-2">
												{#each $TranscriptStore.wordArray.filter((dp) => dp.speaker === user.name).slice(-3) as dataPoint}
													<div class="p-2 bg-white rounded">
														<p class="text-sm">"{dataPoint.word}"</p>
														<p class="text-xs text-gray-500">Time: {dataPoint.startTime.toFixed(2)}s - {dataPoint.endTime.toFixed(2)}s</p>
													</div>
												{/each}
											</div>
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
			<div class="modal-action">
				<button class="btn" on:click={() => (isOpen = false)}>Close</button>
			</div>
		</div>
	</div>
{/if}
