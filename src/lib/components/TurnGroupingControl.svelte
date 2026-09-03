<script lang="ts">
	/** How many nodes one AI action occupies. */
	interface Props {
		/** Renders in a panel rather than as a floating card over the canvas. */
		inline?: boolean;
	}
	let { inline = false }: Props = $props();
	import AppSettingsStore, { type AiTurnGrouping } from '../../stores/appSettingsStore';
	import TranscriptStore from '../../stores/transcriptStore';

	const OPTIONS: { value: AiTurnGrouping; label: string; hint: string }[] = [
		{ value: 'none', label: 'Events', hint: 'The raw log. One tool use is two nodes: the call, then the result.' },
		{ value: 'tool-uses', label: 'Tool uses', hint: 'A call and the result answering it become one node, spoken by the tool.' },
		{ value: 'agents', label: 'Agents', hint: 'Also folds all of a delegated agent’s own work into one node per agent.' }
	];

	const isAI = $derived($TranscriptStore.sourceKind === 'ai');
	const current = $derived($AppSettingsStore.aiTurnGrouping);
	const hint = $derived(OPTIONS.find((o) => o.value === current)?.hint ?? '');

	function choose(value: AiTurnGrouping) {
		AppSettingsStore.update((s) => ({ ...s, aiTurnGrouping: value }));
	}
</script>

{#if isAI}
	<div class="tg-container" class:tg-container--inline={inline}>
		<div class="tg-card" class:tg-card--inline={inline}>
			<div class="tg-label">Grouping</div>
			<div class="tg-seg" role="radiogroup" aria-label="Turn grouping">
				{#each OPTIONS as opt (opt.value)}
					<button
						class="tg-opt"
						class:is-on={current === opt.value}
						role="radio"
						aria-checked={current === opt.value}
						title={opt.hint}
						onclick={() => choose(opt.value)}
					>
						{opt.label}
					</button>
				{/each}
			</div>
			<div class="tg-hint">{hint}</div>
		</div>
	</div>
{/if}

<style>
	.tg-container {
		position: absolute;
		top: 12px;
		right: 12px;
		z-index: 40;
		pointer-events: none;
	}

	.tg-container--inline {
		position: static;
		pointer-events: auto;
	}

	.tg-card--inline {
		width: 100%;
		border: none;
		border-radius: 0;
		box-shadow: none;
		background: transparent;
		padding: 0;
	}

	.tg-card {
		pointer-events: auto;
		background: color-mix(in srgb, var(--te-bg) 92%, transparent);
		border: 1px solid var(--te-border-muted);
		border-radius: var(--te-radius-lg);
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.12);
		padding: 8px 10px;
		width: 232px;
	}

	.tg-label {
		font-size: var(--te-font-label);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--te-fg-muted);
		margin-bottom: 6px;
	}

	.tg-seg {
		display: flex;
		border: 1px solid var(--te-border);
		border-radius: var(--te-radius);
		overflow: hidden;
	}

	.tg-opt {
		flex: 1;
		font-size: var(--te-font-small);
		font-family: inherit;
		padding: 5px 0;
		background: transparent;
		color: var(--te-fg-muted);
		border: none;
		cursor: pointer;
	}

	.tg-opt + .tg-opt {
		border-left: 1px solid var(--te-border);
	}

	.tg-opt:hover {
		background: var(--te-bg-muted);
		color: var(--te-fg);
	}

	.tg-opt:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: -2px;
	}

	.tg-opt.is-on {
		background: var(--te-accent);
		color: var(--te-accent-fg);
		font-weight: 600;
	}

	.tg-hint {
		font-size: var(--te-font-label);
		line-height: 1.45;
		color: var(--te-fg-subtle);
		margin-top: 6px;
	}
</style>
