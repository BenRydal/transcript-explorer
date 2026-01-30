<script lang="ts">
	import { DateTime } from 'luxon';

	interface Props {
		isOpen?: boolean;
		savedAt?: number | null;
		onrestore?: () => void;
		ondiscard?: () => void;
	}

	let {
		isOpen = $bindable(false),
		savedAt = null,
		onrestore,
		ondiscard
	}: Props = $props();

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
</script>

{#if isOpen}
	<div class="modal modal-open">
		<div class="modal-box">
			<h3 class="font-bold text-lg">Recover Unsaved Work?</h3>
			<p class="py-4">
				We found a transcript from your previous session
				{#if savedAt}
					<span class="text-base-content/70">({formatTimestamp(savedAt)})</span>
				{/if}.
				Would you like to restore it?
			</p>
			<div class="modal-action">
				<button class="btn btn-ghost" onclick={discard}>Start Fresh</button>
				<button class="btn btn-primary" onclick={restore}>Restore</button>
			</div>
		</div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-backdrop" onclick={discard} onkeydown={() => {}}></div>
	</div>
{/if}
