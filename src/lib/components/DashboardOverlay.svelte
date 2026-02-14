<script lang="ts">
	import ConfigStore, { DASHBOARD_PANEL_OPTIONS } from '../../stores/configStore';
	import type { Component } from 'svelte';
	import {
		Minus,
		Plus,
		Flower2,
		Grid3x3,
		Fingerprint,
		ChartNoAxesGantt,
		ChartBarStacked,
		ChartNetwork,
		MessageCircleQuestionMark,
		Cloud,
		CloudRain,
		Route
	} from '@lucide/svelte';
	import { CANVAS_SPACING } from '../constants/ui';

	const PANEL_ICONS: Record<string, { label: string; icon: Component }> = {
		speakerGarden: { label: 'Garden', icon: Flower2 },
		speakerHeatmap: { label: 'Heatmap', icon: Grid3x3 },
		speakerFingerprint: { label: 'Fingerprint', icon: Fingerprint },
		turnChart: { label: 'Chart', icon: ChartNoAxesGantt },
		turnLength: { label: 'Length', icon: ChartBarStacked },
		turnNetwork: { label: 'Network', icon: ChartNetwork },
		questionFlow: { label: 'Question', icon: MessageCircleQuestionMark },
		contributionCloud: { label: 'Cloud', icon: Cloud },
		wordRain: { label: 'Rain', icon: CloudRain },
		wordJourney: { label: 'Journey', icon: Route }
	};

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
	let openPopoverIndex = $state<number | null>(null);
	let panelRefs: HTMLElement[] = $state([]);

	$effect(() => {
		if (openPopoverIndex === null) return;
		const handleClick = (event: MouseEvent) => {
			if (!panelRefs[openPopoverIndex!]?.contains(event.target as Node)) {
				openPopoverIndex = null;
			}
		};
		document.addEventListener('click', handleClick, true);
		return () => document.removeEventListener('click', handleClick, true);
	});

	function selectViz(index: number, key: string) {
		ConfigStore.update((store) => {
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
		{@const info = PANEL_ICONS[panelKey]}
		<div class="panel-cell" class:span-two={count === 3 && i === 0}>
			<div class="relative flex justify-end pointer-events-auto" bind:this={panelRefs[i]}>
				<!-- Icon trigger -->
				<button
					class="p-1.5 rounded-md bg-white/70 hover:bg-white/90 border border-gray-300 shadow-sm transition-colors"
					onclick={() => (openPopoverIndex = openPopoverIndex === i ? null : i)}
					title={info.label}
				>
					<info.icon size={14} strokeWidth={1.5} class="text-gray-600" />
				</button>

				<!-- Icon grid popover -->
				{#if openPopoverIndex === i}
					<div class="absolute top-full right-0 mt-1 z-[52] rounded-lg py-2 px-2 shadow-lg bg-base-100 border border-gray-200 w-44">
						<div class="grid grid-cols-3 gap-1">
							{#each DASHBOARD_PANEL_OPTIONS as option}
								{@const tile = PANEL_ICONS[option.key]}
								{@const isActive = panelKey === option.key}
								{@const isUsed = $ConfigStore.dashboardPanels.some((k, j) => j !== i && k === option.key)}
								<button
									class="flex flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[10px] cursor-pointer transition-colors
										{isActive ? 'bg-primary/10 text-primary ring-1 ring-primary/30 font-medium' : isUsed ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100'}"
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
</style>
