<script lang="ts">
	/** What is currently shaping the view, and a way to undo each of it. */
	import { X } from '@lucide/svelte';
	import FiltersStore from '../../stores/filtersStore';
	import UserStore from '../../stores/userStore';
	import CodeStore from '../../stores/codeStore';
	import P5Store from '../../stores/p5Store';

	interface Chip {
		id: string;
		label: string;
		/** Absent for chips that report state rather than a filter to remove. */
		clear?: () => void;
	}

	function refresh() {
		$P5Store?.fillAllData?.();
	}

	const hiddenSpeakers = $derived($UserStore.filter((u) => !u.enabled));
	const disabledCodes = $derived($CodeStore.filter((c) => !c.enabled));

	const chips = $derived.by(() => {
		const out: Chip[] = [];

		if ($FiltersStore.wordToSearch.length > 0) {
			out.push({
				id: 'search',
				label: `“${$FiltersStore.wordToSearch}”`,
				clear: () => {
					FiltersStore.update((f) => ({ ...f, wordToSearch: '' }));
					refresh();
				}
			});
		}

		if (hiddenSpeakers.length > 0) {
			const shown = $UserStore.length - hiddenSpeakers.length;
			out.push({
				id: 'speakers',
				label: `${shown} of ${$UserStore.length} speakers`,
				clear: () => {
					UserStore.update((users) => users.map((u) => ({ ...u, enabled: true })));
					refresh();
				}
			});
		}

		if (disabledCodes.length > 0) {
			out.push({
				id: 'codes',
				label: `${$CodeStore.length - disabledCodes.length} of ${$CodeStore.length} codes`,
				clear: () => {
					CodeStore.update((codes) => codes.map((c) => ({ ...c, enabled: true })));
					refresh();
				}
			});
		}

		if ($CodeStore.length > 0 && !$FiltersStore.showUncoded) {
			out.push({
				id: 'uncoded',
				label: 'uncoded hidden',
				clear: () => {
					FiltersStore.update((f) => ({ ...f, showUncoded: true }));
					refresh();
				}
			});
		}

		if ($FiltersStore.stopWordsEnabled) {
			out.push({
				id: 'stopwords',
				label: 'stop words removed',
				clear: () => {
					FiltersStore.update((f) => ({ ...f, stopWordsEnabled: false }));
					refresh();
				}
			});
		}

		return out;
	});
</script>

{#if chips.length > 0}
	<div class="te-filter-bar" role="status" aria-label="Active filters">
		<span class="te-filter-bar__label">Showing</span>
		{#each chips as chip (chip.id)}
			<span class="te-filter-bar__chip" class:te-filter-bar__chip--static={!chip.clear}>
				{chip.label}
				{#if chip.clear}
					<button
						type="button"
						class="te-filter-bar__clear"
						title="Remove this filter"
						aria-label={`Remove filter: ${chip.label}`}
						onclick={chip.clear}
					>
						<X size={11} />
					</button>
				{/if}
			</span>
		{/each}
	</div>
{/if}

<style>
	.te-filter-bar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--te-sp-1);
		padding: var(--te-sp-1) var(--te-sp-3);
		border-bottom: 1px solid var(--te-border-muted);
		background: var(--te-bg-subtle);
		font-size: var(--te-font-small);
	}

	.te-filter-bar__label {
		font-size: var(--te-font-label);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-weight: 600;
		color: var(--te-fg-muted);
		margin-right: var(--te-sp-1);
	}

	.te-filter-bar__chip {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		padding: 2px 4px 2px 8px;
		border: 1px solid color-mix(in srgb, var(--te-accent) 30%, transparent);
		border-radius: var(--te-radius-pill);
		background: var(--te-accent-tint);
		color: var(--te-accent);
		white-space: nowrap;
	}

	.te-filter-bar__chip--static {
		padding-right: 8px;
		border-color: var(--te-border);
		background: transparent;
		color: var(--te-fg-muted);
	}

	.te-filter-bar__clear {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		padding: 0;
		border: none;
		border-radius: var(--te-radius-pill);
		background: transparent;
		color: inherit;
		cursor: pointer;
	}

	.te-filter-bar__clear:hover {
		background: color-mix(in srgb, var(--te-accent) 20%, transparent);
	}

	.te-filter-bar__clear:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: 1px;
	}
</style>
