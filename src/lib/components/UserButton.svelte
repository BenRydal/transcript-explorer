<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import MdMoreVert from 'svelte-icons/md/MdMoreVert.svelte';
	import { toTitleCase } from '$lib/core/string-utils';

	export let user: { name: string; color: string; enabled: boolean };

	const dispatch = createEventDispatcher();

	function handleSettingsClick(event: MouseEvent) {
		event.stopPropagation();
		dispatch('openDropdown', event);
	}

	$: displayName = toTitleCase(user.name);
</script>

<div class="user-button-container" class:hidden-state={!user.enabled}>
	<button class="user-button" on:click={() => dispatch('toggleVisibility')} title={user.enabled ? `Hide ${displayName}` : `Show ${displayName}`}>
		<span class="color-chip" style:background-color={user.enabled ? user.color : 'transparent'}></span>
		<span class="user-name">{displayName}</span>
	</button>
	<button class="settings-button" on:click={handleSettingsClick} title="Settings">
		<div class="settings-icon">
			<MdMoreVert />
		</div>
	</button>
</div>

<style>
	.user-button-container {
		display: inline-flex;
		align-items: center;
		background-color: #e5e5e5;
		border-radius: 9999px;
		transition:
			opacity 0.15s,
			background-color 0.15s;
	}

	.user-button-container:hover {
		background-color: #d4d4d4;
	}

	.user-button-container.hidden-state {
		opacity: 0.5;
	}

	.user-button {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.5rem 0.375rem 0.75rem;
		background: transparent;
		border: none;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		color: #1f2937;
		user-select: none;
		max-width: 8rem;
	}

	.settings-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.375rem;
		padding-left: 0;
		padding-right: 0.5rem;
		background: transparent;
		border: none;
		cursor: pointer;
		color: #6b7280;
		transition: color 0.15s;
	}

	.settings-button:hover {
		color: #1f2937;
	}

	.settings-icon {
		width: 16px;
		height: 16px;
	}

	.color-chip {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.hidden-state .color-chip {
		background-color: transparent !important;
		border: 2px solid #6b7280;
		width: 10px;
		height: 10px;
	}

	.user-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
