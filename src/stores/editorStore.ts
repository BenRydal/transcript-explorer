import { writable, derived } from 'svelte/store';

export interface EditorSelection {
	selectedTurnNumber: number | null;
	highlightedSpeaker: string | null;
	filteredSpeaker: string | null;
	selectionSource: 'editor' | 'distributionDiagram' | 'distributionDiagramClick' | 'turnChart' | 'contributionCloud' | null;
}

export interface EditorConfig {
	isVisible: boolean;
	orientation: 'horizontal' | 'vertical';
	panelSizes: [number, number];
	isCollapsed: boolean;
	showAdvancedVideoControls: boolean;
}

export interface EditorState {
	selection: EditorSelection;
	config: EditorConfig;
	isDirty: boolean;
}

const initialState: EditorState = {
	selection: {
		selectedTurnNumber: null,
		highlightedSpeaker: null,
		filteredSpeaker: null,
		selectionSource: null
	},
	config: {
		isVisible: false,
		orientation: 'horizontal',
		panelSizes: [60, 40],
		isCollapsed: false,
		showAdvancedVideoControls: false
	},
	isDirty: false
};

const EditorStore = writable<EditorState>(initialState);

/**
 * Derived store that emits a stable key when editor layout changes.
 * Used to trigger canvas resize when orientation or collapse state changes.
 */
export const editorLayoutKey = derived(EditorStore, ($editor) => `${$editor.config.orientation}-${$editor.config.isCollapsed}`);

export default EditorStore;
