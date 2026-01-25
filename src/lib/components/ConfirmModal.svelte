<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let isOpen = false;
	export let title = 'Are you sure?';
	export let message = '';
	export let confirmText = 'Continue';
	export let cancelText = 'Cancel';
	export let destructive = true;

	const dispatch = createEventDispatcher();

	function confirm() {
		dispatch('confirm');
		isOpen = false;
	}

	function cancel() {
		dispatch('cancel');
		isOpen = false;
	}
</script>

{#if isOpen}
	<div class="modal modal-open">
		<div class="modal-box">
			<h3 class="font-bold text-lg">{title}</h3>
			<p class="py-4">{message}</p>
			<div class="modal-action">
				<button class="btn btn-ghost" on:click={cancel}>{cancelText}</button>
				<button class="btn" class:btn-error={destructive} on:click={confirm}>{confirmText}</button>
			</div>
		</div>
		<div class="modal-backdrop" on:click={cancel} on:keydown={() => {}}></div>
	</div>
{/if}
