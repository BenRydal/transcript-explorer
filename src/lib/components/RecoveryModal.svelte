<script lang="ts">
	import { DateTime } from 'luxon';
	import { trapFocus } from '$lib/a11y/focus-trap';

	interface Props {
		isOpen?: boolean;
		savedAt?: number | null;
		onrestore?: () => void;
		ondiscard?: () => void;
	}

	let { isOpen = $bindable(false), savedAt = null, onrestore, ondiscard }: Props = $props();

	let dialogEl: HTMLDivElement | null = $state(null);

	$effect(() => {
		if (!isOpen || !dialogEl) return;
		return trapFocus(dialogEl);
	});

	function restore() {
		onrestore?.();
		isOpen = false;
	}

	function discard() {
		ondiscard?.();
		isOpen = false;
	}

	function formatTimestamp(timestamp: number): string {
		return DateTime.fromMillis(timestamp).toRelative() ?? 'recently';
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			discard();
		}
	}
</script>

{#if isOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal modal-open" onkeydown={handleKey}>
		<div
			bind:this={dialogEl}
			class="modal-box"
			role="dialog"
			aria-modal="true"
			aria-labelledby="recovery-title"
			aria-describedby="recovery-desc"
		>
			<h3 id="recovery-title" class="font-bold text-lg">Recover Unsaved Work?</h3>
			<p id="recovery-desc" class="py-4">
				We found a transcript from your previous session
				{#if savedAt}
					<span class="text-base-content/70">({formatTimestamp(savedAt)})</span>
				{/if}. Would you like to restore it?
			</p>
			<div class="modal-action">
				<button class="btn btn-ghost" onclick={discard}>Start Fresh</button>
				<button class="btn btn-primary" onclick={restore}>Restore</button>
			</div>
		</div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="modal-backdrop" aria-hidden="true" onclick={discard}></div>
	</div>
{/if}
