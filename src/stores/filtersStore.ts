import { writable } from 'svelte/store';

export interface FiltersStoreType {
	wordToSearch: string;
	showUncoded: boolean;
	codeColorMode: boolean;
	/**
	 * When true, the default stopword list (plus any custom entries) is
	 * applied to word-level viz (Contribution Cloud, Word Rain, etc.).
	 * Single source of truth for stopword filtering, toggled from the
	 * Filters panel.
	 */
	stopWordsEnabled: boolean;
	/** User-supplied extra stopwords, merged with DEFAULT_STOPWORDS. */
	customStopWords: string[];
}

export const initialFilters: FiltersStoreType = {
	wordToSearch: '',
	showUncoded: true,
	codeColorMode: false,
	// Off by default  -  preserves pre-existing behavior where stopword
	// filtering is opt-in. Users enable from the Filters panel.
	stopWordsEnabled: false,
	customStopWords: []
};

const FiltersStore = writable<FiltersStoreType>(initialFilters);

export default FiltersStore;
