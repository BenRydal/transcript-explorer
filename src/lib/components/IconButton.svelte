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

	let { icon: Icon, tooltip = '', id = '', disabled = false, onclick, onkeydown }: Props = $props();
</script>

<button
	type="button"
	class="te-btn te-btn--icon te-btn--ghost tooltip tooltip-bottom"
	data-tip={tooltip}
	aria-label={tooltip}
	title={tooltip}
	{id}
	{disabled}
	{onclick}
	{onkeydown}
>
	<Icon size={20} />
</button>
