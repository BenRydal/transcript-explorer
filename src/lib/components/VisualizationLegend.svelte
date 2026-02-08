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
	import ConfigStore from '../../stores/configStore';
	import TranscriptStore from '../../stores/transcriptStore';
	import UserStore from '../../stores/userStore';

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
					{ speakerColors: true, label: 'Color \u2192 speaker' },
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
		const config = $ConfigStore;
		if (config.dashboardToggle) return null;
		for (const [toggle, key] of VIZ_TOGGLES) {
			if (config[toggle]) return legendData[key];
		}
		return null;
	});

	let isVisible = $derived($ConfigStore.legendVisible);

	let speakerGradient = $derived.by(() => {
		const colors = $UserStore.filter((u) => u.enabled).map((u) => u.color);
		if (colors.length <= 1) return colors[0] ?? '';
		return `linear-gradient(to right, ${colors.join(', ')})`;
	});

	function setLegendVisible(visible: boolean) {
		ConfigStore.update((c) => ({ ...c, legendVisible: visible }));
	}
</script>

{#if legend}
	<div class="legend-container">
		{#if isVisible}
			<div class="legend-card" transition:fly={{ y: 8, duration: 150 }}>
				<div class="legend-header">
					<span class="legend-title">{legend.title}</span>
					<button class="legend-close" onclick={() => setLegendVisible(false)} title="Close legend">
						<X size={16} />
					</button>
				</div>
				<div class="legend-items">
					{#each legend.items as item}
						<div class="legend-item">
							{#if 'speakerColors' in item && speakerGradient}
								<span class="legend-gradient" style="background: {speakerGradient}"></span>
							{:else if 'icon' in item}
								{@const Icon = item.icon}
								<span class="legend-icon" style={item.iconColor ? `color: ${item.iconColor}` : ''}>
									<Icon size={14} fill={item.iconColor ? 'currentColor' : 'none'} />
								</span>
							{/if}
							<span class="legend-label">{item.label}</span>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<button class="legend-toggle" onclick={() => setLegendVisible(true)} title="Show legend" transition:fly={{ y: 8, duration: 150 }}>
				<Info size={18} />
			</button>
		{/if}
	</div>
{/if}

<style>
	.legend-container {
		position: absolute;
		bottom: 12px;
		left: 12px;
		z-index: 40;
		pointer-events: none;
	}

	.legend-card,
	.legend-toggle {
		pointer-events: auto;
		background: rgba(255, 255, 255, 0.92);
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.legend-card {
		padding: 8px 12px;
		max-width: 300px;
	}

	.legend-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 4px;
	}

	.legend-title {
		font-size: 0.9rem;
		font-weight: 600;
		color: #374151;
	}

	.legend-close {
		background: none;
		border: none;
		cursor: pointer;
		padding: 2px;
		border-radius: 4px;
		color: #6b7280;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.legend-close:hover {
		background: rgba(0, 0, 0, 0.08);
		color: #374151;
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
