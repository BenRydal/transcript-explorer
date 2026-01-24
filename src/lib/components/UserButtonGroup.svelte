<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import MdChevronLeft from 'svelte-icons/md/MdChevronLeft.svelte';
	import UserButton from './UserButton.svelte';

	export let users: Array<{ name: string; color: string; enabled: boolean }>;
	export let maxVisible: number = 5;

	const dispatch = createEventDispatcher();

	let isExpanded = false;

	// Track users with their original indices
	$: usersWithIndices = users.map((user, index) => ({ user, index }));
	$: visibleUsers = isExpanded || users.length <= maxVisible ? usersWithIndices : usersWithIndices.slice(0, maxVisible - 1);
	$: hiddenCount = users.length - maxVisible + 1;
	$: showExpandButton = users.length > maxVisible;
</script>

<div class="user-button-group">
	{#each visibleUsers as { user, index } (index)}
		<UserButton
			{user}
			on:toggleVisibility={() => dispatch('toggleVisibility', { index })}
			on:openDropdown={(e) => dispatch('openDropdown', { index, event: e.detail })}
		/>
	{/each}

	{#if showExpandButton}
		<button class="expand-button" on:click={() => (isExpanded = !isExpanded)} title={isExpanded ? 'Show fewer' : `Show ${hiddenCount} more`}>
			{#if isExpanded}
				<div class="collapse-icon">
					<MdChevronLeft />
				</div>
			{:else}
				+{hiddenCount}
			{/if}
		</button>
	{/if}
</div>

<style>
	.user-button-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: nowrap;
	}

	.expand-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 2.5rem;
		padding: 0.375rem 0.625rem;
		border-radius: 9999px;
		background-color: #e5e5e5;
		border: none;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 600;
		color: #6b7280;
		transition: background-color 0.15s;
		user-select: none;
	}

	.expand-button:hover {
		background-color: #d4d4d4;
	}

	.expand-button:active {
		background-color: #c4c4c4;
	}

	.collapse-icon {
		width: 1rem;
		height: 1rem;
	}
</style>
