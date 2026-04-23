import { get } from 'svelte/store';
import UIStateStore, { type SidebarTab, type Workspace } from '../../stores/uiStateStore';
import EditorStore from '../../stores/editorStore';
import VideoStore, { showVideo, hideVideo } from '../../stores/videoStore';
import VizStore from '../../stores/vizStore';

/**
 * Phase F — Task workspaces (Analyze / Code / Present).
 *
 * Each preset is a DaVinci-style named layout snapshot: which sidebar tab
 * is open, whether the editor pane is visible, whether the floating video
 * is visible, and whether the multi-viz dashboard overlay is on.
 *
 * Visibility state lives across three stores in TE — EditorStore.config.isVisible,
 * VideoStore.isVisible, and VizStore.dashboardToggle — so the presets are
 * applied by a helper that writes to each store, rather than being held as
 * a flat bag on UIStateStore. Only activeWorkspace + activeSidebarTab live
 * on UIStateStore.
 */
export interface WorkspacePreset {
	sidebarTab: SidebarTab | null;
	editorVisible: boolean;
	videoVisible: boolean;
	dashboardVisible: boolean;
}

export const WORKSPACE_PRESETS: Record<Workspace, WorkspacePreset> = {
	analyze: {
		sidebarTab: 'filters',
		editorVisible: true,
		videoVisible: true,
		dashboardVisible: false
	},
	code: {
		sidebarTab: 'data',
		editorVisible: true,
		videoVisible: false,
		dashboardVisible: false
	},
	present: {
		sidebarTab: null,
		editorVisible: false,
		videoVisible: true,
		dashboardVisible: false
	}
};

export const WORKSPACE_LABELS: Record<Workspace, string> = {
	analyze: 'Analyze',
	code: 'Code',
	present: 'Present'
};

export const WORKSPACE_ORDER: readonly Workspace[] = ['analyze', 'code', 'present'] as const;

/**
 * Apply a workspace preset to the relevant stores. This reshuffles the
 * visible chrome instantly — sidebar tab, editor pane, video panel, and
 * dashboard overlay — and records the active workspace on UIStateStore
 * (which persists it to localStorage).
 *
 * Video visibility is only flipped on when a video is actually loaded;
 * otherwise the preset's videoVisible=true is a no-op. Video visibility
 * flows through the dedicated showVideo/hideVideo helpers so that
 * side-effects (e.g. stopPlayback on hide) stay consistent.
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

	// Video visibility — only meaningful if a video is loaded.
	const video = get(VideoStore);
	if (video.isLoaded) {
		if (preset.videoVisible && !video.isVisible) {
			showVideo();
		} else if (!preset.videoVisible && video.isVisible) {
			hideVideo();
		}
	}

	// Dashboard overlay toggle.
	VizStore.update((state) => ({ ...state, dashboardToggle: preset.dashboardVisible }));
}
