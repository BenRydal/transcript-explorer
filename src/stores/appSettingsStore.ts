import { writable } from 'svelte/store';

/**
 * Which start time a time-based view reads.
 *
 * A contribution ends when the log says it concluded, and that does not vary.
 * Only the start is contested, and these are the three answers the converter
 * emits. They are not competing estimates of one value: each measures a
 * different mechanism, so each is correct for a different question.
 *
 *   record  what was logged. Equals the end, so every contribution is an
 *           instant and nothing is claimed that the log did not state.
 *   work    who was busy. A measured span where one was recorded, an estimate
 *           otherwise. Gaps mean nobody was working.
 *   floor   whose turn it was. Runs from the previous conclusion, so the
 *           session tiles and there are no gaps.
 *
 * Human transcripts carry no lens columns and are unaffected.
 */
export type TimingLens = 'record' | 'work' | 'floor';

export interface AppSettingsStoreType {
	// Start-only mode settings
	preserveGapsBetweenTurns: boolean;
	speechRateWordsPerSecond: number;
	// Video playback settings
	snippetDurationSeconds: number;
	// Timeline animation speed multiplier
	animationRate: number;
	// Which start time the time-based views read. See TimingLens.
	timingLens: TimingLens;
}

export const initialAppSettings: AppSettingsStoreType = {
	preserveGapsBetweenTurns: true,
	speechRateWordsPerSecond: 3,
	snippetDurationSeconds: 2,
	animationRate: 3,
	timingLens: 'work'
};

const AppSettingsStore = writable<AppSettingsStoreType>(initialAppSettings);

export default AppSettingsStore;
