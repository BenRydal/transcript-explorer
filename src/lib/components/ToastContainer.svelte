<script lang="ts">
	import { flip } from 'svelte/animate';
	import { fly, fade } from 'svelte/transition';
	import type { Component } from 'svelte';
	import { notifications, type NotificationType } from '../../stores/notificationStore';
	import { CircleCheck, CircleX, TriangleAlert, Info, X } from '@lucide/svelte';

	const icons: Record<NotificationType, Component> = {
		success: CircleCheck,
		error: CircleX,
		warning: TriangleAlert,
		info: Info
	};
</script>

<div class="toast toast-center toast-top z-50">
	{#each $notifications as { id, type, message } (id)}
		{@const Icon = icons[type]}
		<div class="alert alert-{type} shadow-lg" animate:flip={{ duration: 200 }} in:fly={{ y: -20, duration: 200 }} out:fade={{ duration: 200 }}>
			<Icon size={20} class="shrink-0" />
			<span class="text-sm">{message}</span>
			<button class="btn btn-ghost btn-xs" onclick={() => notifications.dismiss(id)}>
				<X size={16} />
			</button>
		</div>
	{/each}
</div>
