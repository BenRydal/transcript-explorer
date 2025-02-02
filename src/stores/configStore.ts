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
	echoesToggle: boolean;
	stopWordsToggle: boolean;
	repeatedWordsToggle: boolean;
	animationRate: number;
	repeatWordSliderValue: number;
}

export const initialConfig: ConfigStoreType = {
	distributionDiagramToggle: true,
	turnChartToggle: false,
	contributionCloudToggle: false,
	dashboardToggle: false,
	flowersToggle: false,
	separateToggle: false,
	sortToggle: false,
	lastWordToggle: false,
	echoesToggle: false,
	stopWordsToggle: false,
	repeatedWordsToggle: false,
	animationRate: 0.05,
	repeatWordSliderValue: 5
};

const ConfigStore = writable<ConfigStoreType>(initialConfig);

export default ConfigStore;
