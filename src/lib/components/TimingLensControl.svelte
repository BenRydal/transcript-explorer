<script lang="ts">
	/**
	 * Which start time the time-based views read.
	 *
	 * The choice governs every time-based view at once, so it belongs with the
	 * other cross-view controls rather than floating over the canvas -- it was
	 * parked there while filters and settings could not be open together, and
	 * that constraint is gone.
	 *
	 * Hidden for human transcripts, which carry no lens columns and have one
	 * defensible start.
	 */
	interface Props {
		/** Renders in a panel rather than as a floating card over the canvas. */
		inline?: boolean;
	}
	let { inline = false }: Props = $props();
	import AppSettingsStore, { type TimingLens } from '../../stores/appSettingsStore';
	import TranscriptStore from '../../stores/transcriptStore';

	const OPTIONS: { value: TimingLens; label: string; hint: string }[] = [
		{ value: 'record', label: 'Record', hint: 'Every contribution is an instant, exactly as logged.' },
		{ value: 'work', label: 'Work', hint: 'Bars are time spent working. A gap means nobody was working.' },
		{ value: 'floor', label: 'Floor', hint: 'Each contribution runs from the last. The session has no gaps.' }
	];

	const isAI = $derived($TranscriptStore.sourceKind === 'ai');
	const current = $derived($AppSettingsStore.timingLens);
	const hint = $derived(OPTIONS.find((o) => o.value === current)?.hint ?? '');

	function choose(value: TimingLens) {
		AppSettingsStore.update((s) => ({ ...s, timingLens: value }));
	}
</script>

{#if isAI}
	<div class="tl-container" class:tl-container--inline={inline}>
		<div class="tl-card" class:tl-card--inline={inline}>
			<div class="tl-label">Timing</div>
			<div class="tl-seg" role="radiogroup" aria-label="Timing lens">
				{#each OPTIONS as opt (opt.value)}
					<button
						class="tl-opt"
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
			<div class="tl-hint">{hint}</div>
		</div>
	</div>
{/if}

<style>
	.tl-container {
		position: absolute;
		top: 12px;
		right: 12px;
		z-index: 40;
		pointer-events: none;
	}

	.tl-container--inline {
		position: static;
		pointer-events: auto;
	}

	.tl-card--inline {
		width: 100%;
		border: none;
		border-radius: 0;
		box-shadow: none;
		background: transparent;
		padding: 0;
	}

	.tl-card {
		pointer-events: auto;
		background: color-mix(in srgb, var(--te-bg) 92%, transparent);
		border: 1px solid var(--te-border-muted);
		border-radius: var(--te-radius-lg);
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.12);
		padding: 8px 10px;
		width: 232px;
	}

	.tl-label {
		font-size: var(--te-font-label);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--te-fg-muted);
		margin-bottom: 6px;
	}

	.tl-seg {
		display: flex;
		border: 1px solid var(--te-border);
		border-radius: var(--te-radius);
		overflow: hidden;
	}

	.tl-opt {
		flex: 1;
		font-size: var(--te-font-small);
		font-family: inherit;
		padding: 5px 0;
		background: transparent;
		color: var(--te-fg-muted);
		border: none;
		cursor: pointer;
	}

	.tl-opt + .tl-opt {
		border-left: 1px solid var(--te-border);
	}

	.tl-opt:hover {
		background: var(--te-bg-muted);
		color: var(--te-fg);
	}

	.tl-opt:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: -2px;
	}

	.tl-opt.is-on {
		background: var(--te-accent);
		color: var(--te-accent-fg);
		font-weight: 600;
	}

	.tl-hint {
		font-size: var(--te-font-label);
		line-height: 1.45;
		color: var(--te-fg-subtle);
		margin-top: 6px;
	}
</style>
