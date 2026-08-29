import { writable, derived } from 'svelte/store';
import FiltersStore from './filtersStore';
import { BIN_COUNT_AUTO } from '../lib/draw/heatmap-scaling';

export type SpeakerSortOrder = 'default' | 'words' | 'turns' | 'alpha';
export type FingerprintOverlayMode = 'auto' | 'overlay' | 'small-multiples';
export type FingerprintChartMode = 'radar' | 'parallel';
export type ContributionCloudWeighting = 'frequency' | 'tfidf';
export type WordJourneyLaneOrder = 'uptake' | 'default' | 'alpha';

export interface VizStoreType {
	speakerGardenToggle: boolean;
	turnChartToggle: boolean;
	contributionCloudToggle: boolean;
	turnNetworkToggle: boolean;
	wordRainToggle: boolean;
	dashboardToggle: boolean;
	speakerHeatmapToggle: boolean;
	turnLengthToggle: boolean;
	speakerFingerprintToggle: boolean;
	questionFlowToggle: boolean;
	wordJourneyToggle: boolean;
	silenceOverlapToggle: boolean;
	separateToggle: boolean;
	sortToggle: boolean;
	lastWordToggle: boolean;
	echoWordsToggle: boolean;
	repeatedWordsToggle: boolean;
	repeatWordSliderValue: number;
	// Speaker sort order (shared across Speaker Garden, Turn Network, etc.)
	speakerSortOrder: SpeakerSortOrder;
	// Word Rain settings
	wordRainMinFrequency: number;
	wordRainTemporalBinning: boolean;
	wordRainBinCount: number;
	// Turn Network settings
	turnNetworkWeightByWords: boolean;
	turnNetworkHideSelfLoops: boolean;
	turnNetworkMinTransitions: number;
	/**
	 * Temporary review aid: shorten node labels to a fixed prefix so a crowded
	 * network stays readable. The full name remains available on hover.
	 */
	turnNetworkShortLabels: boolean;
	/** Diagnostic overlay showing the current frame rate. */
	showFpsMonitor: boolean;
	// when true, edges use lag-sequential adjusted residuals (z-scores) instead of raw counts
	turnNetworkStatisticalMode: boolean;
	// Turn Chart settings
	// Independent of grouping: identity, not row count.
	turnChartColorByKind: boolean;
	turnChartGroupByKind: boolean;
	// Turn Chart settings
	turnChartCapAspect: boolean;
	// Speaker Garden settings
	speakerGardenLabels: boolean;
	// Question Flow settings
	questionFlowHideAbsent: boolean;
	questionFlowTypeMarks: boolean;
	// Word Journey settings
	wordJourneyHideAbsent: boolean;
	wordJourneyLaneOrder: WordJourneyLaneOrder;
	// Speaker Heatmap settings
	heatmapBinCount: number;
	// Turn Length settings
	turnLengthBinCount: number;
	// Speaker Fingerprint settings
	// 'auto' picks small-multiples when >3 speakers (avoids radar-overlay occlusion)
	fingerprintOverlayMode: FingerprintOverlayMode;
	fingerprintChartMode: FingerprintChartMode;
	// Contribution Cloud settings
	// tfidf surfaces speaker-distinctive words instead of raw frequency
	contributionCloudWeighting: ContributionCloudWeighting;
	// When true, visualizations normalize/scale to the current selection
	// (timeline range + enabled speakers) instead of the full transcript.
	// A rendering behavior rather than a content filter, so it lives in the
	// Settings panel alongside other viz-behavior options.
	scaleToVisibleData: boolean;
}

export const initialViz: VizStoreType = {
	speakerGardenToggle: true,
	turnChartToggle: false,
	contributionCloudToggle: false,
	turnNetworkToggle: false,
	wordRainToggle: false,
	dashboardToggle: false,
	speakerHeatmapToggle: false,
	turnLengthToggle: false,
	speakerFingerprintToggle: false,
	questionFlowToggle: false,
	wordJourneyToggle: false,
	silenceOverlapToggle: true,
	separateToggle: false,
	sortToggle: false,
	lastWordToggle: false,
	echoWordsToggle: false,
	repeatedWordsToggle: false,
	repeatWordSliderValue: 5,
	speakerSortOrder: 'default',
	wordRainMinFrequency: 1,
	wordRainTemporalBinning: false,
	wordRainBinCount: 8,
	turnNetworkWeightByWords: false,
	turnNetworkHideSelfLoops: true,
	turnNetworkMinTransitions: 1,
	turnNetworkShortLabels: false,
	showFpsMonitor: false,
	turnNetworkStatisticalMode: false,
	turnChartColorByKind: false,
	turnChartGroupByKind: false,
	turnChartCapAspect: false,
	speakerGardenLabels: false,
	questionFlowHideAbsent: true,
	questionFlowTypeMarks: false,
	wordJourneyHideAbsent: true,
	wordJourneyLaneOrder: 'default',
	heatmapBinCount: BIN_COUNT_AUTO,
	turnLengthBinCount: BIN_COUNT_AUTO,
	fingerprintOverlayMode: 'auto',
	fingerprintChartMode: 'radar',
	contributionCloudWeighting: 'frequency',
	scaleToVisibleData: false
};

const VizStore = writable<VizStoreType>(initialViz);

/**
 * Derived store that emits a stable key when word-processing filters change,
 * so consumers can re-fill the visible data set. Using a string key ensures
 * Svelte's reactivity properly detects changes even when boolean values switch
 * from true to false. Stopword state lives in FiltersStore (the single source
 * of truth), so we combine both stores here to catch its changes too.
 */
export const filterToggleKey = derived(
	[VizStore, FiltersStore],
	([$viz, $filters]) => `${$viz.echoWordsToggle}-${$viz.lastWordToggle}-${$filters.stopWordsEnabled}-${$filters.customStopWords.join(',')}`
);

export default VizStore;
