import { writable, derived } from 'svelte/store';
import type { DataPoint } from '../models/dataPoint';

export interface ConfigStoreType {
	distributionDiagramToggle: boolean;
	turnChartToggle: boolean;
	contributionCloudToggle: boolean;
	dashboardToggle: boolean;
	flowersToggle: boolean;
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
	hoveredSpeakerInDistributionDiagram: string | null;
	// Start-only mode settings
	preserveGapsBetweenTurns: boolean;
	speechRateWordsPerSecond: number;
	// Video playback settings
	snippetDurationSeconds: number;
}

export const initialConfig: ConfigStoreType = {
	distributionDiagramToggle: true,
	turnChartToggle: false,
	contributionCloudToggle: false,
	dashboardToggle: false,
	flowersToggle: true,
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
	hoveredSpeakerInDistributionDiagram: null,
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
