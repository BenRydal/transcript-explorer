import UIStateStore, { type SidebarTab, type Workspace } from '../../stores/uiStateStore';
import EditorStore from '../../stores/editorStore';
import VizStore from '../../stores/vizStore';

/**
 * Phase F  -  Task workspaces (Edit / Present / Transcribe).
 *
 * Each preset is a DaVinci-style named layout snapshot: which sidebar tab
 * is open, whether the editor pane is visible, and whether the multi-viz
 * dashboard overlay is on. Video visibility is intentionally NOT part of a
 * preset  -  it is an independent toggle the shell owns, so switching modes
 * never forces the floating video on or off.
 *
 * Visibility state lives across two stores in TE  -  EditorStore.config.isVisible
 * and VizStore.dashboardToggle  -  so the presets are applied by a helper that
 * writes to each store, rather than being held as a flat bag on UIStateStore.
 * Only activeWorkspace + activeSidebarTab live on UIStateStore.
 */
export interface WorkspacePreset {
	sidebarTab: SidebarTab | null;
	editorVisible: boolean;
	dashboardVisible: boolean;
}

export const WORKSPACE_PRESETS: Record<Workspace, WorkspacePreset> = {
	edit: {
		sidebarTab: 'filters',
		editorVisible: true,
		dashboardVisible: false
	},
	present: {
		sidebarTab: null,
		editorVisible: false,
		dashboardVisible: false
	},
	transcribe: {
		sidebarTab: null,
		editorVisible: false,
		dashboardVisible: false
	}
};

export const WORKSPACE_LABELS: Record<Workspace, string> = {
	edit: 'Edit',
	present: 'Present',
	transcribe: 'Transcribe'
};

export const WORKSPACE_ORDER: readonly Workspace[] = ['edit', 'present', 'transcribe'] as const;

/**
 * Apply a workspace preset to the relevant stores. This reshuffles the
 * visible chrome instantly  -  sidebar tab, editor pane, and dashboard
 * overlay  -  and records the active workspace on UIStateStore (which
 * persists it to localStorage).
 *
 * Video visibility is deliberately untouched here: it is an independent
 * toggle the shell owns, so mode switches never force the floating video
 * on or off.
 */
export function applyWorkspace(id: Workspace): void {
	const preset = WORKSPACE_PRESETS[id];

	// Sidebar + workspace id on UIStateStore (persisted).
	UIStateStore.update((state) => ({
		...state,
		activeSidebarTab: preset.sidebarTab,
		activeWorkspace: id
	}));

	// Editor visibility.
	EditorStore.update((state) => ({
		...state,
		config: { ...state.config, isVisible: preset.editorVisible }
	}));

	// Dashboard overlay toggle.
	VizStore.update((state) => ({ ...state, dashboardToggle: preset.dashboardVisible }));
}
