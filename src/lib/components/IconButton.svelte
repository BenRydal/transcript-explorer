<script lang="ts">
	import type { Component } from 'svelte';

	interface Props {
		icon: Component;
		tooltip?: string;
		id?: string;
		disabled?: boolean;
		onclick?: (e: MouseEvent) => void;
		onkeydown?: (e: KeyboardEvent) => void;
	}

	let {
		icon: Icon,
		tooltip = '',
		id = '',
		disabled = false,
		onclick,
		onkeydown
	}: Props = $props();

	function handleClick(e: MouseEvent) {
		if (!disabled) {
			onclick?.(e);
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
	onclick={handleClick}
	{onkeydown}
>
	<Icon size={20} />
</div>
