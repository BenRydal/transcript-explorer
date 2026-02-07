import { writable, derived } from 'svelte/store';

export type GardenSortOrder = 'default' | 'words' | 'turns' | 'alpha';

export interface ConfigStoreType {
	speakerGardenToggle: boolean;
	turnChartToggle: boolean;
	contributionCloudToggle: boolean;
	turnNetworkToggle: boolean;
	wordRainToggle: boolean;
	dashboardToggle: boolean;
	speakerHeatmapToggle: boolean;
	turnLengthToggle: boolean;
	speakerFingerprintToggle: boolean;
	questionFlowToggle: boolean;
	wordJourneyToggle: boolean;
	silenceOverlapToggle: boolean;
	separateToggle: boolean;
	sortToggle: boolean;
	lastWordToggle: boolean;
	echoWordsToggle: boolean;
	stopWordsToggle: boolean;
	repeatedWordsToggle: boolean;
	animationRate: number;
	repeatWordSliderValue: number;
	wordToSearch: string;
	// Start-only mode settings
	preserveGapsBetweenTurns: boolean;
	speechRateWordsPerSecond: number;
	// Video playback settings
	snippetDurationSeconds: number;
	// Dashboard panel selection
	dashboardPanels: string[];
	// Speaker Garden settings
	gardenSortOrder: GardenSortOrder;
	// Word Rain settings
	wordRainMinFrequency: number;
	wordRainTemporalBinning: boolean;
	wordRainBinCount: number;
	// Turn Network settings
	turnNetworkWeightByWords: boolean;
	turnNetworkHideSelfLoops: boolean;
	turnNetworkMinTransitions: number;
	// Speaker Heatmap settings
	heatmapBinCount: number;
	// Turn Length settings
	turnLengthBinCount: number;
	// Legend overlay
	legendVisible: boolean;
	// Speaker Fingerprint settings
	fingerprintOverlayMode: boolean;
}

export const DASHBOARD_PANEL_OPTIONS = [
	{ key: 'speakerGarden', label: 'Speaker Garden' },
	{ key: 'turnChart', label: 'Turn Chart' },
	{ key: 'contributionCloud', label: 'Contribution Cloud' },
	{ key: 'turnNetwork', label: 'Turn Network' },
	{ key: 'wordRain', label: 'Word Rain' },
	{ key: 'speakerHeatmap', label: 'Speaker Heatmap' },
	{ key: 'turnLength', label: 'Turn Length' },
	{ key: 'speakerFingerprint', label: 'Speaker Fingerprint' },
	{ key: 'questionFlow', label: 'Question Flow' },
	{ key: 'wordJourney', label: 'Word Journey' }
] as const;

export const initialConfig: ConfigStoreType = {
	speakerGardenToggle: true,
	turnChartToggle: false,
	contributionCloudToggle: false,
	turnNetworkToggle: false,
	wordRainToggle: false,
	dashboardToggle: false,
	speakerHeatmapToggle: false,
	turnLengthToggle: false,
	speakerFingerprintToggle: false,
	questionFlowToggle: false,
	wordJourneyToggle: false,
	silenceOverlapToggle: true,
	separateToggle: false,
	sortToggle: false,
	lastWordToggle: false,
	echoWordsToggle: false,
	stopWordsToggle: false,
	repeatedWordsToggle: false,
	animationRate: 3,
	repeatWordSliderValue: 5,
	wordToSearch: '',
	// Start-only mode settings (default: estimate from speech rate)
	preserveGapsBetweenTurns: true,
	speechRateWordsPerSecond: 3,
	// Video playback settings
	snippetDurationSeconds: 2,
	// Speaker Garden settings
	gardenSortOrder: 'default',
	// Dashboard panel selection
	dashboardPanels: ['turnChart', 'contributionCloud', 'speakerGarden'],
	wordRainMinFrequency: 1,
	wordRainTemporalBinning: false,
	wordRainBinCount: 8,
	turnNetworkWeightByWords: false,
	turnNetworkHideSelfLoops: false,
	turnNetworkMinTransitions: 1,
	heatmapBinCount: 0,
	turnLengthBinCount: 0,
	legendVisible: true,
	fingerprintOverlayMode: true
};

const ConfigStore = writable<ConfigStoreType>(initialConfig);

/**
 * Derived store that emits a stable key when filter toggles change.
 * Using a string key ensures Svelte's reactivity properly detects changes
 * even when boolean values switch from true to false.
 */
export const filterToggleKey = derived(ConfigStore, ($config) => `${$config.echoWordsToggle}-${$config.lastWordToggle}-${$config.stopWordsToggle}`);

export default ConfigStore;
