import { writable } from 'svelte/store';

export interface FiltersStoreType {
	wordToSearch: string;
	showUncoded: boolean;
	scaleToVisibleData: boolean;
	codeColorMode: boolean;
	/**
	 * When true, the default stopword list (plus any custom entries) is
	 * applied to word-level viz (Contribution Cloud, Word Rain, etc.).
	 * Complements the legacy VizStore `stopWordsToggle`; either turning on
	 * engages filtering so existing users' saved preferences still work.
	 */
	stopWordsEnabled: boolean;
	/** User-supplied extra stopwords, merged with DEFAULT_STOPWORDS. */
	customStopWords: string[];
}

export const initialFilters: FiltersStoreType = {
	wordToSearch: '',
	showUncoded: true,
	scaleToVisibleData: false,
	codeColorMode: false,
	// Off by default  -  preserves pre-existing behavior where stopword
	// filtering is opt-in. Users enable from the Filters panel.
	stopWordsEnabled: false,
	customStopWords: []
};

const FiltersStore = writable<FiltersStoreType>(initialFilters);

export default FiltersStore;
