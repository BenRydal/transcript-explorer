<script lang="ts">
	import UIStateStore, { DASHBOARD_PANEL_OPTIONS } from '../../stores/uiStateStore';
	import { Minus, Plus } from '@lucide/svelte';
	import { CANVAS_SPACING } from '../constants/ui';
	import { PANEL_TILES } from '../ui/panel-icons';

	function addPanel() {
		UIStateStore.update((store) => {
			if (store.dashboardPanels.length >= 4) return store;
			const used = new Set(store.dashboardPanels);
			const next = DASHBOARD_PANEL_OPTIONS.find((o) => !used.has(o.key))?.key ?? DASHBOARD_PANEL_OPTIONS[0].key;
			return { ...store, dashboardPanels: [...store.dashboardPanels, next] };
		});
	}

	function removePanel() {
		UIStateStore.update((store) => {
			if (store.dashboardPanels.length <= 2) return store;
			return { ...store, dashboardPanels: store.dashboardPanels.slice(0, -1) };
		});
	}

	let count = $derived($UIStateStore.dashboardPanels.length);
	let openPopoverIndex = $state<number | null>(null);
	let panelRefs: (HTMLElement | null)[] = $state([]);

	$effect(() => {
		if (openPopoverIndex === null) return;
		const currentIndex = openPopoverIndex;
		const handleClick = (event: MouseEvent) => {
			if (!panelRefs[currentIndex]?.contains(event.target as Node)) {
				openPopoverIndex = null;
			}
		};
		document.addEventListener('click', handleClick, true);
		return () => document.removeEventListener('click', handleClick, true);
	});

	function selectViz(index: number, key: string) {
		UIStateStore.update((store) => {
			const panels = [...store.dashboardPanels];
			panels[index] = key;
			return { ...store, dashboardPanels: panels };
		});
		openPopoverIndex = null;
	}
</script>

<div
	class="dashboard-overlay"
	class:two={count === 2}
	class:three={count === 3}
	class:four={count === 4}
	style:padding="{CANVAS_SPACING / 2}px"
	style:gap="{CANVAS_SPACING}px"
>
	<div class="absolute top-2 left-2 pointer-events-auto flex gap-0.5 z-[51]">
		<button class="dash-overlay__btn" onclick={removePanel} disabled={count <= 2} title="Remove panel">
			<Minus size={12} />
		</button>
		<button class="dash-overlay__btn" onclick={addPanel} disabled={count >= 4} title="Add panel">
			<Plus size={12} />
		</button>
	</div>

	{#each $UIStateStore.dashboardPanels as panelKey, i}
		{@const info = PANEL_TILES[panelKey]}
		<div class="panel-cell" class:span-two={count === 3 && i === 0}>
			<div class="relative flex justify-end" bind:this={panelRefs[i]}>
				<!-- Icon trigger -->
				<button class="dash-overlay__btn" onclick={() => (openPopoverIndex = openPopoverIndex === i ? null : i)} title={info.label}>
					<info.icon size={14} strokeWidth={1.5} />
				</button>

				<!-- Icon grid popover -->
				{#if openPopoverIndex === i}
					<div class="dash-overlay__popover">
						<div class="grid grid-cols-3 gap-1">
							{#each DASHBOARD_PANEL_OPTIONS as option}
								{@const tile = PANEL_TILES[option.key]}
								{@const isActive = panelKey === option.key}
								{@const isUsed = $UIStateStore.dashboardPanels.some((k, j) => j !== i && k === option.key)}
								<button
									class="dash-overlay__tile"
									class:is-active={isActive}
									class:is-used={isUsed}
									onclick={() => selectViz(i, option.key)}
									disabled={isUsed}
									title={option.label}
								>
									<tile.icon size={14} strokeWidth={isActive ? 2.2 : 1.5} />
									{tile.label}
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/each}
</div>

<style>
	.dashboard-overlay {
		position: absolute;
		inset: 0;
		display: grid;
		pointer-events: none;
		z-index: 50;
	}

	.dashboard-overlay.two {
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr;
	}

	.dashboard-overlay.three,
	.dashboard-overlay.four {
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr 1fr;
	}

	.span-two {
		grid-column: 1 / -1;
	}

	.panel-cell {
		pointer-events: none;
	}

	.dash-overlay__btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 6px;
		border: 1px solid var(--te-border);
		border-radius: var(--te-radius);
		background: color-mix(in srgb, var(--te-bg) 70%, transparent);
		color: var(--te-fg-muted);
		cursor: pointer;
		pointer-events: auto;
		transition:
			background 120ms ease,
			color 120ms ease;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
	}

	.dash-overlay__btn:hover:not(:disabled) {
		background: var(--te-bg);
		color: var(--te-fg);
	}

	.dash-overlay__btn:focus-visible {
		outline: 2px solid var(--te-focus-ring);
		outline-offset: 1px;
	}

	.dash-overlay__btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.dash-overlay__popover {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 4px;
		z-index: 52;
		padding: var(--te-sp-2);
		background: var(--te-bg);
		border: 1px solid var(--te-border-muted);
		border-radius: var(--te-radius-lg);
		box-shadow: 0 8px 16px rgba(0, 0, 0, 0.12);
		width: 11rem;
		pointer-events: auto;
	}

	.dash-overlay__tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 4px;
		border: 1px solid transparent;
		border-radius: var(--te-radius-sm);
		background: transparent;
		color: var(--te-fg-muted);
		font-size: 10px;
		cursor: pointer;
		transition:
			background 120ms ease,
			color 120ms ease;
	}

	.dash-overlay__tile:hover:not(:disabled) {
		background: var(--te-bg-muted);
		color: var(--te-fg);
	}

	.dash-overlay__tile.is-active {
		background: var(--te-accent-tint);
		color: var(--te-accent);
		font-weight: 500;
		border-color: color-mix(in srgb, var(--te-accent) 30%, transparent);
	}

	.dash-overlay__tile.is-used {
		color: var(--te-fg-subtle);
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
