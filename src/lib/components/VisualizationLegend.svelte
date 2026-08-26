<script lang="ts">
	import { fly } from 'svelte/transition';
	import {
		X,
		Info,
		Video,
		Circle,
		ArrowUpDown,
		ArrowLeftRight,
		Clock,
		Type,
		List,
		Square,
		ArrowRight,
		Minus,
		ChartBar,
		Columns3,
		Hexagon,
		Star,
		Diamond,
		HelpCircle,
		MessageCircle
	} from '@lucide/svelte';
	import type { Component } from 'svelte';
	import VizStore from '../../stores/vizStore';
	import UIStateStore from '../../stores/uiStateStore';
	import TranscriptStore from '../../stores/transcriptStore';
	import UserStore from '../../stores/userStore';
	// `use:` not `{@attach}`: this repo's eslint parser cannot read attachments,
	// and an unparseable file gets skipped by the linter entirely.
	import { legacyDraggable } from '@neodrag/svelte/legacy';
	import { controls, ControlFrom, bounds, BoundsFrom, events, position } from '@neodrag/svelte';

	/**
	 * The legend sits over whichever part of a view happens to be near it, and which part that is changes per visualization, so it is moved rather than placed.
	 */
	const MARGIN = 12;
	const POS_KEY = 'te:legend:corner';

	let rootEl: HTMLDivElement | null = $state(null);
	let pos = $state({ x: MARGIN, y: MARGIN });
	let corner = $state<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'>('bottom-left');

	/** Offsets of each corner for the current parent and element size. */
	function cornerOffsets() {
		const parent = rootEl?.parentElement;
		if (!parent || !rootEl) return null;
		const right = Math.max(MARGIN, parent.clientWidth - rootEl.offsetWidth - MARGIN);
		const bottomY = Math.max(MARGIN, parent.clientHeight - rootEl.offsetHeight - MARGIN);
		return {
			'top-left': { x: MARGIN, y: MARGIN },
			'top-right': { x: right, y: MARGIN },
			'bottom-left': { x: MARGIN, y: bottomY },
			'bottom-right': { x: right, y: bottomY }
		} as const;
	}

	function settle(next?: typeof corner) {
		const offsets = cornerOffsets();
		if (!offsets) return;
		if (next) corner = next;
		pos = { ...offsets[corner] };
	}

	function snapToNearest() {
		const offsets = cornerOffsets();
		if (!offsets) return;
		let best = corner;
		let bestDist = Infinity;
		for (const [name, o] of Object.entries(offsets)) {
			const d = (o.x - pos.x) ** 2 + (o.y - pos.y) ** 2;
			if (d < bestDist) {
				bestDist = d;
				best = name as typeof corner;
			}
		}
		settle(best);
		try {
			window.localStorage.setItem(POS_KEY, best);
		} catch {
			/* private mode: the default corner is fine */
		}
	}

	$effect(() => {
		try {
			const saved = window.localStorage.getItem(POS_KEY);
			if (saved === 'top-left' || saved === 'top-right' || saved === 'bottom-left' || saved === 'bottom-right') corner = saved;
		} catch {
			/* ignore */
		}
		// After paint: before it, the card has no measured size and settling
		// leaves it stuck at the top-left origin.
		const raf = requestAnimationFrame(() => settle());
		return () => cancelAnimationFrame(raf);
	});

	// Re-settle when the canvas or the card itself changes size, so a corner
	// stays a corner.
	$effect(() => {
		const card = rootEl;
		const parent = card?.parentElement;
		if (!card || !parent) return;
		const ro = new ResizeObserver(() => settle());
		ro.observe(parent);
		ro.observe(card);
		return () => ro.disconnect();
	});

	// No Compartment: the action re-runs when this array changes, which is
	// exactly when `pos` does.
	const dragPlugins = $derived([
		position({ current: pos }),
		controls({ block: ControlFrom.selector('.legend-close') }),
		bounds(BoundsFrom.parent()),
		events({
			onDrag: ({ offset }) => {
				pos = { x: offset.x, y: offset.y };
			},
			onDragEnd: () => snapToNearest()
		})
	]);

	type LegendItem = { label: string } & ({ icon: Component; iconColor?: string } | { speakerColors: true });

	const videoItem = (label: string): LegendItem => ({
		icon: Video,
		iconColor: '#16a34a',
		label
	});

	let isUntimed = $derived($TranscriptStore.timingMode === 'untimed');

	let legendData = $derived.by(() => {
		const v = (label: string): LegendItem[] => (isUntimed ? [] : [videoItem(label)]);

		return {
			speakerGarden: {
				title: 'Speaker Garden',
				items: [
					{ icon: Circle, label: 'Flower size \u2192 total words' },
					{ icon: ArrowUpDown, label: 'Stalk height \u2192 number of turns' },
					{ speakerColors: true, label: 'Color \u2192 speaker' },
					...v('Click flower \u2192 preview turns')
				]
			},
			turnChart: {
				title: 'Turn Chart',
				items: [
					{ icon: Clock, label: `Horizontal position \u2192 ${isUntimed ? 'word count' : 'time'}` },
					{ icon: ArrowLeftRight, label: `Bubble width \u2192 ${isUntimed ? 'turn length' : 'turn duration'}` },
					{ icon: ArrowUpDown, label: 'Bubble height \u2192 words in turn' },
					{ icon: Minus, label: 'Hairline \u2192 words at that height' },
					{ icon: Square, label: 'Notched edge \u2192 taller than the scale allows' },
					{ speakerColors: true, label: 'Color \u2192 speaker' },
					{ icon: Minus, iconColor: '#dc2626', label: 'Top strip \u2192 parallel machine activity' },
					{ icon: Minus, label: 'Bottom strip \u2192 nobody active' },
					...v('Click bubble \u2192 play from turn')
				]
			},
			contributionCloud: {
				title: 'Contribution Cloud',
				items: [
					{ icon: List, label: 'Words in transcript order' },
					{ icon: Type, label: 'Text size \u2192 total count of word' },
					{ speakerColors: true, label: 'Color \u2192 speaker' },
					...v('Click word \u2192 play from turn')
				]
			},
			wordRain: {
				title: 'Word Rain',
				items: [
					{ icon: Clock, label: `Position \u2192 ${isUntimed ? 'mean position of word' : 'mean time of word'}` },
					{ icon: Type, label: 'Text size \u2192 total occurrences' },
					{ icon: ChartBar, label: 'Bar height \u2192 total occurrences' },
					{ speakerColors: true, label: 'Color \u2192 dominant speaker' },
					{ icon: Square, iconColor: '#9ca3af', label: 'Gray \u2192 shared across speakers' },
					...v('Click word \u2192 play all occurrences')
				]
			},
			speakerHeatmap: {
				title: 'Speaker Heatmap',
				items: [
					{ icon: ArrowUpDown, label: 'Row \u2192 speaker' },
					{ icon: Columns3, label: `Column \u2192 ${isUntimed ? 'word count bin' : 'time bin'}` },
					{ icon: Square, label: 'Cell opacity \u2192 words in bin' },
					{ speakerColors: true, label: 'Color \u2192 speaker' },
					...v('Click cell \u2192 play from turn')
				]
			},
			turnNetwork: {
				title: 'Turn Network',
				items: [
					{ icon: Circle, label: 'Node size \u2192 total words' },
					{ icon: ArrowRight, label: 'Arrow direction \u2192 who follows whom' },
					{ icon: Minus, label: 'Edge thickness \u2192 transitions' },
					{ speakerColors: true, label: 'Color \u2192 speaker' },
					...v('Click node \u2192 play related turns')
				]
			},
			turnLength: {
				title: 'Turn Length',
				items: [
					{ icon: ArrowLeftRight, label: 'X-axis \u2192 words per turn' },
					{ icon: ArrowUpDown, label: 'Bar height \u2192 number of turns' },
					{ speakerColors: true, label: 'Color \u2192 speaker' },
					...v('Click bar \u2192 play related turns')
				]
			},
			speakerFingerprint: {
				title: 'Speaker Fingerprint',
				items: [
					{ icon: Hexagon, label: 'Larger shape \u2192 higher values' },
					{ speakerColors: true, label: 'Color \u2192 speaker' },
					...v('Click shape \u2192 play examples')
				]
			},
			wordJourney: {
				title: 'Word Journey',
				items: [
					{ icon: Clock, label: `Horizontal position \u2192 ${isUntimed ? 'word count' : 'time'}` },
					{ icon: Star, label: 'Star \u2192 first overall occurrence' },
					{ icon: Diamond, label: 'Diamond \u2192 first by speaker' },
					{ icon: Circle, label: 'Circle \u2192 other occurrences' },
					{ speakerColors: true, label: 'Color \u2192 speaker' },
					...v('Click dot \u2192 play from occurrence')
				]
			},
			questionFlow: {
				title: 'Question Flow',
				items: [
					{ icon: Clock, label: `Horizontal position \u2192 ${isUntimed ? 'word count' : 'time'}` },
					{ icon: HelpCircle, label: 'Circle with ? \u2192 question' },
					{ icon: MessageCircle, label: 'Circle \u2192 answer' },
					{ icon: Circle, label: 'Node size \u2192 word count' },
					{ icon: ArrowRight, label: 'Arc \u2192 question to answer' },
					{ speakerColors: true, label: 'Color \u2192 speaker' },
					...v('Click node \u2192 play Q&A')
				]
			}
		} as Record<string, { title: string; items: LegendItem[] }>;
	});

	const VIZ_TOGGLES = [
		['speakerGardenToggle', 'speakerGarden'],
		['turnChartToggle', 'turnChart'],
		['contributionCloudToggle', 'contributionCloud'],
		['wordRainToggle', 'wordRain'],
		['speakerHeatmapToggle', 'speakerHeatmap'],
		['turnNetworkToggle', 'turnNetwork'],
		['turnLengthToggle', 'turnLength'],
		['speakerFingerprintToggle', 'speakerFingerprint'],
		['wordJourneyToggle', 'wordJourney'],
		['questionFlowToggle', 'questionFlow']
	] as const;

	let legend = $derived.by(() => {
		const viz = $VizStore;
		if (viz.dashboardToggle) return null;
		for (const [toggle, key] of VIZ_TOGGLES) {
			if (viz[toggle]) return legendData[key];
		}
		return null;
	});

	let speakerGradient = $derived.by(() => {
		const colors = $UserStore.filter((u) => u.enabled).map((u) => u.color);
		if (colors.length <= 1) return colors[0] ?? '';
		return `linear-gradient(to right, ${colors.join(', ')})`;
	});

	function setLegendVisible(visible: boolean) {
		UIStateStore.update((u) => ({ ...u, legendVisible: visible }));
	}
</script>

{#if legend}
	{#if $UIStateStore.legendVisible}
		<div bind:this={rootEl} class="legend-card" use:legacyDraggable={dragPlugins}>
			<div class="legend-header">
				<span class="legend-title">{legend.title}</span>
				<button class="legend-close" onclick={() => setLegendVisible(false)} title="Close legend" aria-label="Close legend">
					<X size={13} />
				</button>
			</div>
			<div class="legend-items">
				{#each legend.items as item}
					<div class="legend-item">
						{#if 'speakerColors' in item}
							<span class="legend-gradient" style="background: {speakerGradient}"></span>
						{:else}
							<span class="legend-icon" style={item.iconColor ? `color: ${item.iconColor}` : ''}>
								<item.icon size={13} />
							</span>
						{/if}
						<span class="legend-label">{item.label}</span>
					</div>
				{/each}
			</div>
		</div>
	{:else}
		<div class="legend-container">
			<button class="legend-toggle" onclick={() => setLegendVisible(true)} title="Show legend" transition:fly={{ y: 8, duration: 150 }}>
				<Info size={18} />
			</button>
		</div>
	{/if}
{/if}

<style>
	.legend-card {
		position: absolute;
		top: 0;
		left: 0;
		z-index: 40;
		width: 260px;
		max-width: calc(100% - 24px);
		pointer-events: auto;
		background: color-mix(in srgb, var(--te-bg) 94%, transparent);
		border: 1px solid var(--te-border-muted);
		border-radius: var(--te-radius-lg);
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.12);
		padding: 8px 10px;
		cursor: grab;
		touch-action: none;
	}

	.legend-card:active {
		cursor: grabbing;
	}

	.legend-close {
		cursor: pointer;
	}

	.legend-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--te-sp-2);
		margin-bottom: 6px;
	}

	.legend-title {
		font-size: var(--te-font-label);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--te-fg-muted);
	}

	.legend-close {
		display: inline-flex;
		padding: 2px;
		border: none;
		border-radius: var(--te-radius-sm);
		background: transparent;
		color: var(--te-fg-muted);
		cursor: pointer;
	}

	.legend-close:hover {
		background: var(--te-bg-muted);
	}

	.legend-container {
		position: absolute;
		bottom: 12px;
		left: 12px;
		z-index: 40;
		pointer-events: none;
	}

	.legend-items {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 0.8rem;
		color: #4b5563;
		line-height: 1.3;
	}

	.legend-icon {
		width: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: #6b7280;
	}

	.legend-gradient {
		width: 16px;
		height: 10px;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.legend-label {
		white-space: nowrap;
	}

	.legend-toggle {
		padding: 6px;
		cursor: pointer;
		color: #6b7280;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.legend-toggle:hover {
		background: rgba(255, 255, 255, 1);
		color: #374151;
	}
</style>
