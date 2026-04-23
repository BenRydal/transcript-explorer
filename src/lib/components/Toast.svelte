<script lang="ts">
	import { fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { CircleCheck, CircleX, Info, X } from '@lucide/svelte';
	import type { Component } from 'svelte';
	import { toasts, type ToastKind } from '../../stores/toastStore';

	/**
	 * Bottom-right toast stack. Non-blocking chrome for one-line
	 * feedback — separate from the existing NotificationStore /
	 * ToastContainer (which is top-center, heavier, daisyUI-styled).
	 *
	 * Motion: items fly in from below; the CSS-level reduced-motion
	 * guard in app.css clamps transition duration so users who opt
	 * out see an instant pop rather than a slide.
	 *
	 * Accessibility: the stack itself is a polite live region; each
	 * toast is a role="status". Dismiss is keyboard-reachable.
	 */
	const icons: Record<ToastKind, Component> = {
		info: Info,
		success: CircleCheck,
		error: CircleX
	};

	const iconColors: Record<ToastKind, string> = {
		info: 'var(--te-fg-muted)',
		success: '#16a34a',
		error: 'var(--te-danger)'
	};
</script>

<div class="te-toast-stack" role="region" aria-label="Notifications" aria-live="polite">
	{#each $toasts as toast (toast.id)}
		{@const Icon = icons[toast.kind]}
		<div
			class="te-toast te-toast--{toast.kind}"
			role="status"
			animate:flip={{ duration: 160 }}
			in:fly={{ y: 20, duration: 180 }}
			out:fly={{ y: 20, duration: 160 }}
		>
			<span class="te-toast__icon" style="color: {iconColors[toast.kind]};">
				<Icon size={16} aria-hidden="true" />
			</span>
			<span class="te-toast__msg">{toast.message}</span>
			<button
				type="button"
				class="te-toast__close"
				aria-label="Dismiss notification"
				onclick={() => toasts.dismiss(toast.id)}
			>
				<X size={14} aria-hidden="true" />
			</button>
		</div>
	{/each}
</div>

<style>
	.te-toast-stack {
		position: fixed;
		right: var(--te-sp-4);
		bottom: var(--te-sp-4);
		z-index: 9999;
		display: flex;
		flex-direction: column;
		gap: var(--te-sp-2);
		pointer-events: none;
	}

	.te-toast {
		display: inline-flex;
		align-items: center;
		gap: var(--te-sp-2);
		max-width: 280px;
		padding: var(--te-sp-2) var(--te-sp-3);
		background: var(--te-bg);
		color: var(--te-fg);
		border: 1px solid var(--te-border-muted);
		border-left-width: 3px;
		border-radius: var(--te-radius);
		box-shadow: 0 8px 16px rgba(0, 0, 0, 0.08);
		font: var(--te-font-small) / var(--te-leading) var(--te-font-stack);
		pointer-events: auto;
	}

	.te-toast--info {
		border-left-color: var(--te-accent);
	}

	.te-toast--success {
		border-left-color: #16a34a;
	}

	.te-toast--error {
		border-left-color: var(--te-danger);
	}

	.te-toast__icon {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
	}

	.te-toast__msg {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.te-toast__close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		padding: 0;
		background: transparent;
		border: none;
		color: var(--te-fg-muted);
		cursor: pointer;
		border-radius: var(--te-radius-sm);
	}

	.te-toast__close:hover {
		background: var(--te-bg-muted);
		color: var(--te-fg);
	}

	.te-toast__close:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: 1px;
	}
</style>
