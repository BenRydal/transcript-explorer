import { writable } from 'svelte/store';

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
	selectedWordFromContributionCloud: string;
	firstWordOfTurnSelectedInTurnChart: string;
	arrayOfFirstWords: string[];
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
	animationRate: 0.05,
	repeatWordSliderValue: 5,
	selectedWordFromContributionCloud: '',
	firstWordOfTurnSelectedInTurnChart: '',
	arrayOfFirstWords: [],
	wordToSearch: '',
	hoveredSpeakerInDistributionDiagram: null,
	// Start-only mode settings (default: fill to next turn)
	preserveGapsBetweenTurns: false,
	speechRateWordsPerSecond: 3
};

const ConfigStore = writable<ConfigStoreType>(initialConfig);

export default ConfigStore;
