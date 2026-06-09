import type { Component } from 'svelte';
import {
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

/** Short label + icon for each visualization panel, keyed by viz id. */
export const PANEL_TILES: Record<string, { label: string; icon: Component }> = {
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
