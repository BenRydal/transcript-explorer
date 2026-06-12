import { writable } from 'svelte/store';

export type SidebarTab = 'viz' | 'filters' | 'data' | 'settings' | 'help';

export type Workspace = 'edit' | 'present' | 'transcribe';

/**
 * First-load onboarding lifecycle. `unseen` = show the welcome dialog on
 * the next client render. `seen` = user started the tour from the dialog.
 * `dismissed` = user explicitly opted out via the "don't show again"
 * checkbox. Both `seen` and `dismissed` suppress the dialog on subsequent
 * loads.
 */
export type OnboardingState = 'unseen' | 'dismissed' | 'seen';

/**
 * Payload describing what the user clicked on the visualization canvas.
 * Used to tailor the context-menu action list (glyph / word / turn).
 */
export type ContextMenuPayload =
	| { kind: 'glyph'; time: number; speakerId?: string; turnId?: string }
	| { kind: 'word'; time: number; word: string; speakerId?: string }
	| { kind: 'turn'; time: number; turnId: string; speakerId?: string };

export interface ContextMenuState {
	open: boolean;
	x: number;
	y: number;
	payload: ContextMenuPayload | null;
}

export interface UIStateStoreType {
	// Legend overlay visibility
	legendVisible: boolean;
	// Dashboard panel selection (layout list of panel keys)
	dashboardPanels: string[];
	// Currently-open activity-bar tab. null = sidebar closed.
	activeSidebarTab: SidebarTab | null;
	// Sidebar width (px). Mirrors the library SidePanel's bindable width.
	sidebarWidth: number;
	// Floating selection-contextual action menu (Phase E).
	contextMenu: ContextMenuState;
	// Task workspace preset (Phase F). Drives default chrome layout for
	// Edit / Present / Transcribe modes.
	activeWorkspace: Workspace;
	// First-load welcome-dialog lifecycle. Persisted across reloads.
	onboardingState: OnboardingState;
}

export const DASHBOARD_PANEL_OPTIONS = [
	{ key: 'speakerGarden', label: 'Speaker Garden' },
	{ key: 'turnChart', label: 'Turn Chart' },
	{ key: 'contributionCloud', label: 'Contribution Cloud' },
	{ key: 'turnNetwork', label: 'Turn Network' },
	{ key: 'wordRain', label: 'Word Rain' },
	{ key: 'speakerHeatmap', label: 'Speaker Heatmap' },
	{ key: 'turnLength', label: 'Turn Length' },
	{ key: 'speakerFingerprint', label: 'Speaker Fingerprint' },
	{ key: 'questionFlow', label: 'Question Flow' },
	{ key: 'wordJourney', label: 'Word Journey' }
] as const;

export const initialContextMenu: ContextMenuState = {
	open: false,
	x: 0,
	y: 0,
	payload: null
};

const ACTIVE_WORKSPACE_STORAGE_KEY = 'te:ui:activeWorkspace';
const ONBOARDING_STATE_STORAGE_KEY = 'te:ui:onboardingState';

const VALID_WORKSPACES: readonly Workspace[] = ['edit', 'present', 'transcribe'] as const;

/**
 * Legacy workspace names (pre-rename: Analyze / Code / Present) map onto the
 * current modes when hydrating a persisted value. Analyze and Code both
 * collapse into Edit; Present is unchanged.
 */
const LEGACY_WORKSPACE_MIGRATIONS: Record<string, Workspace> = {
	analyze: 'edit',
	code: 'edit',
	present: 'present'
};
const VALID_ONBOARDING_STATES: readonly OnboardingState[] = [
	'unseen',
	'dismissed',
	'seen'
] as const;

function isValidWorkspace(value: unknown): value is Workspace {
	return typeof value === 'string' && (VALID_WORKSPACES as readonly string[]).includes(value);
}

function isValidOnboardingState(value: unknown): value is OnboardingState {
	return (
		typeof value === 'string' &&
		(VALID_ONBOARDING_STATES as readonly string[]).includes(value)
	);
}

function readPersistedWorkspace(): Workspace | null {
	if (typeof window === 'undefined') return null;
	try {
		const raw = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
		if (raw === null) return null;
		if (isValidWorkspace(raw)) return raw;
		// Migrate legacy workspace names (analyze/code → edit, present → present).
		// Anything unrecognized falls through to the caller's default ('edit').
		if (typeof raw === 'string' && raw in LEGACY_WORKSPACE_MIGRATIONS) {
			return LEGACY_WORKSPACE_MIGRATIONS[raw];
		}
		return null;
	} catch {
		return null;
	}
}

function readPersistedOnboardingState(): OnboardingState | null {
	if (typeof window === 'undefined') return null;
	try {
		const raw = window.localStorage.getItem(ONBOARDING_STATE_STORAGE_KEY);
		if (raw === null) return null;
		return isValidOnboardingState(raw) ? raw : null;
	} catch {
		return null;
	}
}

export const initialUIState: UIStateStoreType = {
	legendVisible: true,
	dashboardPanels: ['turnChart', 'contributionCloud', 'speakerGarden'],
	activeSidebarTab: null,
	sidebarWidth: 280,
	contextMenu: initialContextMenu,
	activeWorkspace: readPersistedWorkspace() ?? 'edit',
	onboardingState: readPersistedOnboardingState() ?? 'unseen'
};

const UIStateStore = writable<UIStateStoreType>(initialUIState);

// Persist activeWorkspace + onboardingState across reloads. Keep the
// persisted surface tight  -  only fields that are genuinely preference-
// grade belong here.
if (typeof window !== 'undefined') {
	let lastWrittenWorkspace: Workspace = initialUIState.activeWorkspace;
	let lastWrittenOnboarding: OnboardingState = initialUIState.onboardingState;
	UIStateStore.subscribe((state) => {
		if (state.activeWorkspace !== lastWrittenWorkspace) {
			lastWrittenWorkspace = state.activeWorkspace;
			try {
				window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, state.activeWorkspace);
			} catch {
				// localStorage can throw (quota, disabled)  -  persistence is best-effort.
			}
		}
		if (state.onboardingState !== lastWrittenOnboarding) {
			lastWrittenOnboarding = state.onboardingState;
			try {
				window.localStorage.setItem(ONBOARDING_STATE_STORAGE_KEY, state.onboardingState);
			} catch {
				// localStorage can throw (quota, disabled)  -  persistence is best-effort.
			}
		}
	});
}

export default UIStateStore;
