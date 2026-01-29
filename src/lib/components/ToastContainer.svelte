<script lang="ts">
	import { flip } from 'svelte/animate';
	import { fly, fade } from 'svelte/transition';
	import type { Component } from 'svelte';
	import { notifications, type NotificationType } from '../../stores/notificationStore';
	import MdCheckCircle from 'svelte-icons/md/MdCheckCircle.svelte';
	import MdError from 'svelte-icons/md/MdError.svelte';
	import MdWarning from 'svelte-icons/md/MdWarning.svelte';
	import MdInfo from 'svelte-icons/md/MdInfo.svelte';
	import MdClose from 'svelte-icons/md/MdClose.svelte';

	const icons: Record<NotificationType, Component> = {
		success: MdCheckCircle,
		error: MdError,
		warning: MdWarning,
		info: MdInfo
	};
</script>

<div class="toast toast-center toast-top z-50">
	{#each $notifications as { id, type, message } (id)}
		{@const Icon = icons[type]}
		<div class="alert alert-{type} shadow-lg" animate:flip={{ duration: 200 }} in:fly={{ y: -20, duration: 200 }} out:fade={{ duration: 200 }}>
			<div class="w-5 h-5 shrink-0">
				<Icon />
			</div>
			<span class="text-sm">{message}</span>
			<button class="btn btn-ghost btn-xs" onclick={() => notifications.dismiss(id)}>
				<div class="w-4 h-4">
					<MdClose />
				</div>
			</button>
		</div>
	{/each}
</div>
