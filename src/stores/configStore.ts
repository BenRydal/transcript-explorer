import { writable, derived } from 'svelte/store';
import type { DataPoint } from '../models/dataPoint';

export interface ConfigStoreType {
	distributionDiagramToggle: boolean;
	turnChartToggle: boolean;
	contributionCloudToggle: boolean;
	dashboardToggle: boolean;
	flowersToggle: boolean;
	separateToggle: boolean;
	sortToggle: boolean;
	lastWordToggle: boolean;
	echoWordsToggle: boolean;
	stopWordsToggle: boolean;
	repeatedWordsToggle: boolean;
	animationRate: number;
	repeatWordSliderValue: number;
	selectedWordFromContributionCloud: DataPoint | null;
	cloudHasOverflow: boolean;
	firstWordOfTurnSelectedInTurnChart: DataPoint | null;
	arrayOfFirstWords: DataPoint[];
	wordToSearch: string;
	hoveredSpeakerInDistributionDiagram: string | null;
	// Start-only mode settings
	preserveGapsBetweenTurns: boolean;
	speechRateWordsPerSecond: number;
}

export const initialConfig: ConfigStoreType = {
	distributionDiagramToggle: true,
	turnChartToggle: false,
	contributionCloudToggle: false,
	dashboardToggle: false,
	flowersToggle: true,
	separateToggle: false,
	sortToggle: false,
	lastWordToggle: false,
	echoWordsToggle: false,
	stopWordsToggle: false,
	repeatedWordsToggle: false,
	animationRate: 3,
	repeatWordSliderValue: 5,
	selectedWordFromContributionCloud: null,
	cloudHasOverflow: false,
	firstWordOfTurnSelectedInTurnChart: null,
	arrayOfFirstWords: [],
	wordToSearch: '',
	hoveredSpeakerInDistributionDiagram: null,
	// Start-only mode settings (default: fill to next turn)
	preserveGapsBetweenTurns: false,
	speechRateWordsPerSecond: 3
};

const ConfigStore = writable<ConfigStoreType>(initialConfig);

/**
 * Derived store that emits a stable key when filter toggles change.
 * Using a string key ensures Svelte's reactivity properly detects changes
 * even when boolean values switch from true to false.
 */
export const filterToggleKey = derived(ConfigStore, ($config) => `${$config.echoWordsToggle}-${$config.lastWordToggle}-${$config.stopWordsToggle}`);

export default ConfigStore;
