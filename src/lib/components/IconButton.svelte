<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let icon: ConstructorOfATypedSvelteComponent;
	export let tooltip: string = '';
	export let id: string = '';
	export let disabled: boolean = false;

	const dispatch = createEventDispatcher();

	function handleClick(e: MouseEvent) {
		if (!disabled) {
			dispatch('click', e);
		}
	}
</script>

<div
	data-tip={tooltip}
	class="tooltip tooltip-bottom btn capitalize icon max-h-8 bg-[#ffffff] border-[#ffffff] max-w-16 flex items-center justify-center"
	class:btn-disabled={disabled}
	class:opacity-50={disabled}
	role="button"
	tabindex={disabled ? -1 : 0}
	{id}
	on:click={handleClick}
	on:keydown
>
	<svelte:component this={icon} />
</div>
