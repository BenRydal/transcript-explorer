<script lang="ts">
	import MdChevronLeft from 'svelte-icons/md/MdChevronLeft.svelte';
	import UserButton from './UserButton.svelte';

	interface Props {
		users: Array<{ name: string; color: string; enabled: boolean }>;
		maxVisible?: number;
		ontoggleVisibility?: (index: number) => void;
		onopenDropdown?: (index: number, event: MouseEvent) => void;
	}

	let { users, maxVisible = 5, ontoggleVisibility, onopenDropdown }: Props = $props();

	let isExpanded = $state(false);

	// Track users with their original indices
	let usersWithIndices = $derived(users.map((user, index) => ({ user, index })));
	let visibleUsers = $derived(isExpanded || users.length <= maxVisible ? usersWithIndices : usersWithIndices.slice(0, maxVisible - 1));
	let hiddenCount = $derived(users.length - maxVisible + 1);
	let showExpandButton = $derived(users.length > maxVisible);
</script>

<div class="user-button-group">
	{#each visibleUsers as { user, index } (index)}
		<UserButton
			{user}
			ontoggleVisibility={() => ontoggleVisibility?.(index)}
			onopenDropdown={(event) => onopenDropdown?.(index, event)}
		/>
	{/each}

	{#if showExpandButton}
		<button class="expand-button" onclick={() => (isExpanded = !isExpanded)} title={isExpanded ? 'Show fewer' : `Show ${hiddenCount} more`}>
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
