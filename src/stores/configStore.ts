import { writable } from 'svelte/store';

export interface ConfigStoreType {
	diagramToggle: boolean;
	chartToggle: boolean;
	cloudToggle: boolean;
	dashboardToggle: boolean;
	flowersToggle: boolean;
	separateToggle: boolean;
	sortToggle: boolean;
	lastWordToggle: boolean;
	echoesToggle: boolean;
	stopWordsToggle: boolean;
	repeatedWordsToggle: boolean;
	animationRate: number;
}

export const initialConfig: ConfigStoreType = {
	diagramToggle: true,
	chartToggle: false,
	cloudToggle: false,
	dashboardToggle: false,
	flowersToggle: false,
	separateToggle: false,
	sortToggle: false,
	lastWordToggle: false,
	echoesToggle: false,
	stopWordsToggle: false,
	repeatedWordsToggle: false,
	animationRate: 0.05
};

const ConfigStore = writable<ConfigStoreType>(initialConfig);

export default ConfigStore;
