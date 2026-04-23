import { writable } from 'svelte/store';

export interface AppSettingsStoreType {
	// Start-only mode settings
	preserveGapsBetweenTurns: boolean;
	speechRateWordsPerSecond: number;
	// Video playback settings
	snippetDurationSeconds: number;
	// Timeline animation speed multiplier
	animationRate: number;
}

export const initialAppSettings: AppSettingsStoreType = {
	preserveGapsBetweenTurns: true,
	speechRateWordsPerSecond: 3,
	snippetDurationSeconds: 2,
	animationRate: 3
};

const AppSettingsStore = writable<AppSettingsStoreType>(initialAppSettings);

export default AppSettingsStore;
