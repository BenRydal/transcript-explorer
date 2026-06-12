<script lang="ts">
	import { trapFocus } from '$lib/a11y/focus-trap';

	interface Props {
		isOpen?: boolean;
		title?: string;
		message?: string;
		confirmText?: string;
		cancelText?: string;
		destructive?: boolean;
		onconfirm?: () => void;
		oncancel?: () => void;
	}

	let {
		isOpen = $bindable(false),
		title = 'Are you sure?',
		message = '',
		confirmText = 'Continue',
		cancelText = 'Cancel',
		destructive = true,
		onconfirm,
		oncancel
	}: Props = $props();

	let dialogEl: HTMLDivElement | null = $state(null);
	const titleId = `confirm-title-${Math.random().toString(36).slice(2, 8)}`;
	const descId = `confirm-desc-${Math.random().toString(36).slice(2, 8)}`;

	$effect(() => {
		if (!isOpen || !dialogEl) return;
		return trapFocus(dialogEl);
	});

	function confirm() {
		onconfirm?.();
		isOpen = false;
	}

	function cancel() {
		oncancel?.();
		isOpen = false;
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			cancel();
		}
	}
</script>

{#if isOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal modal-open" onkeydown={handleKey}>
		<div bind:this={dialogEl} class="modal-box" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId}>
			<h3 id={titleId} class="font-bold text-lg">{title}</h3>
			<p id={descId} class="py-4">{message}</p>
			<div class="modal-action">
				<button class="btn btn-ghost" onclick={cancel}>{cancelText}</button>
				<button class="btn" class:btn-error={destructive} onclick={confirm}>{confirmText}</button>
			</div>
		</div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="modal-backdrop" aria-hidden="true" onclick={cancel}></div>
	</div>
{/if}
