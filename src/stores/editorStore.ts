import { writable } from 'svelte/store';

export interface EditorSelection {
	selectedTurnNumber: number | null;
	selectedWordIndex: number | null;
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
		selectedWordIndex: null,
		highlightedSpeaker: null,
		filteredSpeaker: null,
		selectionSource: null
	},
	config: {
		isVisible: false,
		orientation: 'vertical',
		panelSizes: [60, 40],
		isCollapsed: false,
		showAdvancedVideoControls: false
	},
	isDirty: false
};

const EditorStore = writable<EditorState>(initialState);

export default EditorStore;
