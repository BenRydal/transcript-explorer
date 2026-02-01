import { writable, derived } from 'svelte/store';
import type { DataPoint } from '../models/dataPoint';

export interface ConfigStoreType {
	speakerGardenToggle: boolean;
	turnChartToggle: boolean;
	contributionCloudToggle: boolean;
	turnNetworkToggle: boolean;
	wordRainToggle: boolean;
	dashboardToggle: boolean;
	speakerHeatmapToggle: boolean;
	silenceOverlapToggle: boolean;
	separateToggle: boolean;
	sortToggle: boolean;
	lastWordToggle: boolean;
	echoWordsToggle: boolean;
	stopWordsToggle: boolean;
	repeatedWordsToggle: boolean;
	animationRate: number;
	repeatWordSliderValue: number;
	hoveredDataPoint: DataPoint | null;
	cloudHasOverflow: boolean;
	arrayOfFirstWords: DataPoint[];
	wordToSearch: string;
	hoveredSpeakerInGarden: string | null;
	// Start-only mode settings
	preserveGapsBetweenTurns: boolean;
	speechRateWordsPerSecond: number;
	// Video playback settings
	snippetDurationSeconds: number;
}

export const initialConfig: ConfigStoreType = {
	speakerGardenToggle: true,
	turnChartToggle: false,
	contributionCloudToggle: false,
	turnNetworkToggle: false,
	wordRainToggle: false,
	dashboardToggle: false,
	speakerHeatmapToggle: false,
	silenceOverlapToggle: true,
	separateToggle: false,
	sortToggle: false,
	lastWordToggle: false,
	echoWordsToggle: false,
	stopWordsToggle: false,
	repeatedWordsToggle: false,
	animationRate: 3,
	repeatWordSliderValue: 5,
	hoveredDataPoint: null,
	cloudHasOverflow: false,
	arrayOfFirstWords: [],
	wordToSearch: '',
	hoveredSpeakerInGarden: null,
	// Start-only mode settings (default: estimate from speech rate)
	preserveGapsBetweenTurns: true,
	speechRateWordsPerSecond: 3,
	// Video playback settings
	snippetDurationSeconds: 2
};

const ConfigStore = writable<ConfigStoreType>(initialConfig);

/**
 * Derived store that emits a stable key when filter toggles change.
 * Using a string key ensures Svelte's reactivity properly detects changes
 * even when boolean values switch from true to false.
 */
export const filterToggleKey = derived(ConfigStore, ($config) => `${$config.echoWordsToggle}-${$config.lastWordToggle}-${$config.stopWordsToggle}`);

export default ConfigStore;
