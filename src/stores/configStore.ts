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
	scalingVars: {
		minTextSize: number;
		maxTextSize: number;
		spacing: number;
		newSpeakerSpacing: number;
	};
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
	scalingVars: {
		minTextSize: 20,
		maxTextSize: 50,
		spacing: 50,
		newSpeakerSpacing: 75
	}
};

const ConfigStore = writable<ConfigStoreType>(initialConfig);

export default ConfigStore;
