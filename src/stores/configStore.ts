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

// import { writable } from 'svelte/store';

// export interface ConfigStoreType {
// 	isPathColorMode: boolean;
// 	dataHasCodes: boolean;
// 	circleToggle: boolean;
// 	sliceToggle: boolean;
// 	movementToggle: boolean;
// 	stopsToggle: boolean;
// 	highlightToggle: boolean;
// 	maxStopLength: number;
// 	stopSliderValue: number;
// 	alignToggle: boolean;
// 	wordToSearch: string;
// 	animationRate: number;
// 	samplingInterval: number;
// 	smallDataThreshold: number;
// 	conversationRectWidth: number;
// 	movementStrokeWeight: number;
// 	stopStrokeWeight: number;
// }

// export const initialConfig: ConfigStoreType = {
// 	isPathColorMode: false,
// 	dataHasCodes: false,
// 	circleToggle: false,
// 	sliceToggle: false,
// 	movementToggle: false,
// 	stopsToggle: false,
// 	highlightToggle: false,
// 	maxStopLength: 0,
// 	stopSliderValue: 1,
// 	alignToggle: true,
// 	wordToSearch: '',
// 	animationRate: 0.05,
// 	samplingInterval: 0.5,
// 	smallDataThreshold: 3000,
// 	conversationRectWidth: 5,
// 	movementStrokeWeight: 1,
// 	stopStrokeWeight: 9
// };

// const ConfigStore = writable<ConfigStoreType>(initialConfig);

// export default ConfigStore;
