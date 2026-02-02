<script lang="ts">
	import ConfigStore, { DASHBOARD_PANEL_OPTIONS } from '../../stores/configStore';
	import { Minus, Plus } from '@lucide/svelte';
	import { CANVAS_SPACING } from '../constants/ui';

	function setPanelViz(index: number, key: string) {
		ConfigStore.update((store) => {
			const panels = [...store.dashboardPanels];
			panels[index] = key;
			return { ...store, dashboardPanels: panels };
		});
	}

	function addPanel() {
		ConfigStore.update((store) => {
			if (store.dashboardPanels.length >= 4) return store;
			const used = new Set(store.dashboardPanels);
			const next = DASHBOARD_PANEL_OPTIONS.find((o) => !used.has(o.key))?.key ?? DASHBOARD_PANEL_OPTIONS[0].key;
			return { ...store, dashboardPanels: [...store.dashboardPanels, next] };
		});
	}

	function removePanel() {
		ConfigStore.update((store) => {
			if (store.dashboardPanels.length <= 2) return store;
			return { ...store, dashboardPanels: store.dashboardPanels.slice(0, -1) };
		});
	}

	let count = $derived($ConfigStore.dashboardPanels.length);
</script>

<div
	class="dashboard-overlay"
	class:two={count === 2}
	class:three={count === 3}
	class:four={count === 4}
	style:padding="{CANVAS_SPACING / 2}px"
	style:gap="{CANVAS_SPACING}px"
>
	<div class="absolute top-2 right-2 pointer-events-auto flex gap-0.5 z-[51]">
		<button
			class="btn btn-xs btn-ghost bg-white/70 hover:bg-white/90 border border-gray-300 shadow-sm"
			onclick={removePanel}
			disabled={count <= 2}
			title="Remove panel"
		>
			<Minus size={12} />
		</button>
		<button
			class="btn btn-xs btn-ghost bg-white/70 hover:bg-white/90 border border-gray-300 shadow-sm"
			onclick={addPanel}
			disabled={count >= 4}
			title="Add panel"
		>
			<Plus size={12} />
		</button>
	</div>

	{#each $ConfigStore.dashboardPanels as panelKey, i}
		<div class="panel-cell" class:span-two={count === 3 && i === 0}>
			<select
				class="select select-bordered select-xs bg-white/70 hover:bg-white/90 focus:bg-white shadow-sm text-xs pointer-events-auto"
				value={panelKey}
				onchange={(e) => setPanelViz(i, e.currentTarget.value)}
			>
				{#each DASHBOARD_PANEL_OPTIONS as option}
					<option value={option.key} disabled={$ConfigStore.dashboardPanels.some((k, j) => j !== i && k === option.key)}>{option.label}</option>
				{/each}
			</select>
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
</style>
