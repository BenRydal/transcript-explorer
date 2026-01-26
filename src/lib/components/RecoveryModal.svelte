<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { DateTime } from 'luxon';

	export let isOpen = false;
	export let savedAt: number | null = null;

	const dispatch = createEventDispatcher();

	function restore() {
		dispatch('restore');
		isOpen = false;
	}

	function discard() {
		dispatch('discard');
		isOpen = false;
	}

	function formatTimestamp(timestamp: number): string {
		return DateTime.fromMillis(timestamp).toRelative() ?? 'recently';
	}
</script>

{#if isOpen}
	<div class="modal modal-open">
		<div class="modal-box">
			<h3 class="font-bold text-lg">Recover Unsaved Work?</h3>
			<p class="py-4">
				We found a transcript from your previous session
				{#if savedAt}
					<span class="text-base-content/70">({formatTimestamp(savedAt)})</span>
				{/if}.
				Would you like to restore it?
			</p>
			<div class="modal-action">
				<button class="btn btn-ghost" on:click={discard}>Start Fresh</button>
				<button class="btn btn-primary" on:click={restore}>Restore</button>
			</div>
		</div>
		<div class="modal-backdrop" on:click={discard} on:keydown={() => {}}></div>
	</div>
{/if}
