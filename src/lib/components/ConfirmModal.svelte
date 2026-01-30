<script lang="ts">
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

	function confirm() {
		onconfirm?.();
		isOpen = false;
	}

	function cancel() {
		oncancel?.();
		isOpen = false;
	}
</script>

{#if isOpen}
	<div class="modal modal-open">
		<div class="modal-box">
			<h3 class="font-bold text-lg">{title}</h3>
			<p class="py-4">{message}</p>
			<div class="modal-action">
				<button class="btn btn-ghost" onclick={cancel}>{cancelText}</button>
				<button class="btn" class:btn-error={destructive} onclick={confirm}>{confirmText}</button>
			</div>
		</div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-backdrop" onclick={cancel} onkeydown={() => {}}></div>
	</div>
{/if}
