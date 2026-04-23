<script lang="ts">
	import type p5 from 'p5';
	import type { SketchFn } from 'svelte-p5';
	import {
		ActivityBar,
		CanvasFrame,
		ContextMenu,
		Sketch,
		SidePanel,
		SplitPane,
		TimelineScrubber,
		type ActivityBarItem,
		type ContextMenuItem
	} from 'svelte-p5-components';
	import { LayoutDashboard, Filter, Database, Settings as SettingsIcon, CircleHelp } from '@lucide/svelte';
	import { formatTimeAuto } from '$lib/core/time-utils';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';

	// Stores
	import UserStore from '../stores/userStore';
	import P5Store from '../stores/p5Store';
	import VideoStore, { loadVideo, playFrom } from '../stores/videoStore';
	import EditorStore, { editorLayoutKey } from '../stores/editorStore';
	import TimelineStore from '../stores/timelineStore';
	import VizStore, { filterToggleKey } from '../stores/vizStore';
	import AppSettingsStore from '../stores/appSettingsStore';
	import UIStateStore, { type SidebarTab, type ContextMenuPayload, type Workspace } from '../stores/uiStateStore';
	import { applyWorkspace, WORKSPACE_ORDER } from '$lib/ui/workspaces';
	import { initThemeSystem } from '$lib/ui/theme';
	import FiltersStore from '../stores/filtersStore';
	import { filterToSpeaker } from '$lib/speakers/speaker-handlers';
	import { DataPoint } from '../models/dataPoint';
	import HoverStore from '../stores/hoverStore';
	import TranscriptStore from '../stores/transcriptStore';
	import TranscribeModeStore, { toggle as toggleTranscribeMode, exit as exitTranscribeMode } from '../stores/transcribeModeStore';
	import { notifications } from '../stores/notificationStore';
	import { recents } from '../stores/recentsStore';
	import { pushToast } from '../stores/toastStore';
	import { EXAMPLE_LABELS } from '$lib/ui/examples';
	import { fade } from 'svelte/transition';

	// Core utilities
	import { Core } from '$lib/core/core';
	import { igsSketch } from '$lib/p5/igsSketch';
	import { USER_COLORS } from '$lib/constants/ui';
	import {
		createEmptyTranscript,
		createTranscriptFromWhisper,
		createTranscriptFromParsedText,
		createTranscriptFromSubtitle
	} from '$lib/core/transcript-factory';
	import type { ParseResult } from '$lib/core/text-parser';
	import { parseSubtitleText } from '$lib/core/subtitle-parser';
	import { parseCSVRows, parseTXTLines } from '$lib/core/csv-txt-parser';
	import { testTranscript } from '$lib/core/core-utils';
	import { testCodeFile, parseCodeFile, applyCodesByTurn, applyCodesByTime, updateCodeStoreWithNewCodes, getCodeFormatLabel, extractCodeNames } from '$lib/core/code-utils';
	import CodeStore from '../stores/codeStore';
	import { mapColumns, allRequiredMapped, buildFinalMapping, remapData } from '$lib/core/column-mapper';
	import type { CSVPreview, CodePreview } from '../models/csv-preview';
	import { filterValidFiles, createUploadEntries, type UploadedFile } from '$lib/core/file-upload';
	import { getPersistedTimestamp, restoreState, clearState, saveStateDebounced, saveStateImmediate } from '$lib/core/persistence';
	import { getMaxTime } from '$lib/core/timing-utils';
	import {
		applyTranscriptResult,
		triggerCanvasResize,
		openEditor,
		handleDiscard
	} from '$lib/core/transcript-lifecycle';
	import {
		handleScrubberSeek,
		handleScrubberPlayToggle,
		handleScrubberSpeedChange,
		handleSelectionChange,
		handleSelectionCommit
	} from '$lib/timeline/scrubber-bridge';
	import Papa from 'papaparse';

	// Components
	import AppNavbar from '$lib/components/AppNavbar.svelte';
	import TranscriptEditor from '$lib/components/TranscriptEditor.svelte';
	import CanvasTooltip from '$lib/components/CanvasTooltip.svelte';
	import VideoContainer from '$lib/components/VideoContainer.svelte';
	import TranscriptionModal from '$lib/components/TranscriptionModal.svelte';
	import UploadModal from '$lib/components/UploadModal.svelte';
	import PasteModal from '$lib/components/PasteModal.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import TourOverlay from '$lib/components/TourOverlay.svelte';
	import TranscribeModeLayout from '$lib/components/TranscribeModeLayout.svelte';
	import RecoveryModal from '$lib/components/RecoveryModal.svelte';
	import DashboardOverlay from '$lib/components/DashboardOverlay.svelte';
	import VisualizationLegend from '$lib/components/VisualizationLegend.svelte';
	import WelcomeDialog from '$lib/components/WelcomeDialog.svelte';
	import Toast from '$lib/components/Toast.svelte';

	// Sidebar panels
	import VizPanel from '$lib/panels/VizPanel.svelte';
	import FiltersPanel from '$lib/panels/FiltersPanel.svelte';
	import DataPanel from '$lib/panels/DataPanel.svelte';
	import SettingsPanel from '$lib/panels/SettingsPanel.svelte';
	import HelpPanel from '$lib/panels/HelpPanel.svelte';

	import type { TranscriptionResult } from '$lib/core/transcription-service';
	import type { TimingMode } from '../models/transcript';
	import { splitIntoWords } from '$lib/core/string-utils';

	let csvPreview = $state<CSVPreview | null>(null);
	let codePreview = $state<CodePreview | null>(null);

	const PREVIEW_ROW_COUNT = 10;
	const emptyStats = { parseResult: null, speakerCount: 0, turnCount: 0, wordCount: 0, timingMode: null, error: null } as const;

	function recomputePreviewStats(preview: CSVPreview): CSVPreview {
		if (!allRequiredMapped(preview.columnMatches, preview.columnOverrides)) {
			return { ...preview, ...emptyStats };
		}
		const mapping = buildFinalMapping(preview.columnMatches, preview.columnOverrides);
		const remapped = remapData(preview.rawData, mapping);
		const parseResult = parseCSVRows(remapped, get(AppSettingsStore).speechRateWordsPerSecond);
		if (parseResult.turns.length === 0) {
			return { ...preview, ...emptyStats, error: 'No valid turns found after mapping columns.' };
		}
		return {
			...preview,
			parseResult,
			speakerCount: parseResult.speakers.length,
			turnCount: parseResult.turns.length,
			wordCount: parseResult.turns.reduce((sum, t) => sum + splitIntoWords(t.content).length, 0),
			timingMode: parseResult.detectedTimingMode,
			error: null
		};
	}

	function handleColumnMappingChange(expected: string, csvColumn: string | null) {
		if (!csvPreview) return;
		const updated = { ...csvPreview, columnOverrides: { ...csvPreview.columnOverrides, [expected]: csvColumn } };
		csvPreview = recomputePreviewStats(updated);
	}

	function confirmCSVImport() {
		if (!csvPreview?.parseResult) return;
		if (!allRequiredMapped(csvPreview.columnMatches, csvPreview.columnOverrides)) return;
		const fileName = csvPreview.fileName;
		clearState();
		core.clearTranscriptData();
		applyTranscriptResult(createTranscriptFromParsedText(csvPreview.parseResult, csvPreview.parseResult.detectedTimingMode));
		recordCustomLoad(fileName);
		csvPreview = null;
		uploadedFiles = [];
		showUploadModal = false;
	}

	function cancelCSVPreview() {
		csvPreview = null;
	}

	function applyCodeFileResults(results: Papa.ParseResult<Record<string, unknown>>, fileName: string) {
		const transcript = get(TranscriptStore);
		if (transcript.wordArray.length === 0) {
			throw new Error('Load a transcript first, then load a code file to apply codes to it.');
		}
		const parsedCodes = parseCodeFile(results, fileName);
		if (parsedCodes.type === 'turn') {
			applyCodesByTurn(transcript.wordArray, parsedCodes);
		} else {
			if (transcript.timingMode === 'untimed') {
				throw new Error('Time-based code files require a timed transcript. Use turn-based codes for untimed transcripts.');
			}
			applyCodesByTime(transcript.wordArray, parsedCodes);
		}
		updateCodeStoreWithNewCodes(parsedCodes);
		TranscriptStore.update((t) => t);
		p5Instance?.fillAllData?.();
		notifications.success(`Loaded ${parsedCodes.type === 'turn' ? 'turn' : 'time'}-based codes from ${fileName}`);
	}

	function confirmCodeImport() {
		if (!codePreview) return;
		try {
			applyCodeFileResults(codePreview.papaResults, codePreview.fileName);
			codePreview = null;
			uploadedFiles = [];
			showUploadModal = false;
		} catch (err) {
			notifications.error(err instanceof Error ? err.message : 'Failed to apply codes');
		}
	}

	function cancelCodePreview() {
		codePreview = null;
	}

	// Modal state
	let showUploadModal = $state(false);
	let showPasteModal = $state(false);
	let showTranscriptionModal = $state(false);
	let showNewTranscriptConfirm = $state(false);
	let showRecoveryModal = $state(false);
	let recoveryTimestamp: number | null = $state(null);

	// Sidebar helpers
	const SIDEBAR_TABS: { id: SidebarTab; label: string }[] = [
		{ id: 'viz', label: 'Visualizations' },
		{ id: 'filters', label: 'Filters' },
		{ id: 'data', label: 'Data' },
		{ id: 'settings', label: 'Settings' },
		{ id: 'help', label: 'Help' }
	];

	let activeSidebarLabel = $derived(
		SIDEBAR_TABS.find((t) => t.id === $UIStateStore.activeSidebarTab)?.label ?? ''
	);

	// Stable id for the sidebar tabpanel shell — referenced by the focus-
	// restore and resize-handle-keyboard effects to locate the panel DOM.
	// The library ActivityBar doesn't expose per-item ids, so panel
	// labeling goes through aria-label rather than aria-labelledby.
	const SIDE_PANEL_ID = 'te-side-panel';

	function setSidebarTab(next: SidebarTab | null) {
		UIStateStore.update((s) => ({ ...s, activeSidebarTab: next }));
	}

	function handleActivitySelect(id: string) {
		const current = $UIStateStore.activeSidebarTab;
		const next = (current === id ? null : id) as SidebarTab | null;
		setSidebarTab(next);
	}

	/**
	 * Empty-canvas / nav "Load transcript" entry point. Opens the Data
	 * sidebar tab, then on the next frame hands focus to the Upload button
	 * inside DataPanel so keyboard users land in the right place without a
	 * second tab press.
	 */
	function openDataPanelForLoading() {
		setSidebarTab('data');
		requestAnimationFrame(() => {
			const uploadBtn = document.querySelector<HTMLButtonElement>(
				'[data-data-panel-upload]'
			);
			uploadBtn?.focus();
		});
	}

	// Local state for the SidePanel's bindable width, seeded from the store
	// and synced back on change. Keeping a local $state lets us use `bind:width`
	// with the library component (which expects a plain reactive, not a
	// classic writable subscription).
	let sidebarWidth = $state($UIStateStore.sidebarWidth);
	$effect(() => {
		if (sidebarWidth !== $UIStateStore.sidebarWidth) {
			UIStateStore.update((s) => ({ ...s, sidebarWidth }));
		}
	});

	// Sidebar min/max — must match SidePanel's defaults for clamped
	// keyboard resizes.
	const SIDEBAR_MIN_WIDTH = 220;
	const SIDEBAR_MAX_WIDTH = 480;
	const SIDEBAR_KEYBOARD_STEP = 16;

	// Focus management for the sidebar. When the sidebar opens, move
	// focus to the first focusable element inside the panel body so
	// keyboard users don't have to Tab past the navbar + activity bar.
	// When it closes, restore focus to the activity-bar item with the
	// matching aria-label (the library ActivityBar uses the item's
	// `label` prop as aria-label — stable enough to target).
	const SIDEBAR_LABEL_FOR_TAB: Record<SidebarTab, string> = {
		viz: 'Visualizations',
		filters: 'Filters',
		data: 'Data',
		settings: 'Settings',
		help: 'Help'
	};
	let lastOpenedTab: SidebarTab | null = $state(null);
	$effect(() => {
		const nextTab = $UIStateStore.activeSidebarTab;
		if (nextTab && nextTab !== lastOpenedTab) {
			// Opening or switching tabs — focus the panel body after the
			// DOM has had a chance to paint.
			requestAnimationFrame(() => {
				const panelBody = document.querySelector<HTMLElement>(
					`#${SIDE_PANEL_ID} .side-panel__body`
				);
				if (!panelBody) return;
				const firstFocusable = panelBody.querySelector<HTMLElement>(
					'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
				);
				(firstFocusable ?? panelBody).focus({ preventScroll: true });
			});
		} else if (!nextTab && lastOpenedTab) {
			// Closing — restore focus to the activity-bar item that owned it.
			const label = SIDEBAR_LABEL_FOR_TAB[lastOpenedTab];
			requestAnimationFrame(() => {
				const activityBtn = document.querySelector<HTMLButtonElement>(
					`.activity-bar__item[aria-label="${label}"]`
				);
				activityBtn?.focus({ preventScroll: true });
			});
		}
		lastOpenedTab = nextTab;
	});

	// Keyboard resize for the SidePanel separator. The library renders a
	// <div role="separator"> at `.side-panel__resize-handle` that handles
	// pointer drags only. We augment it with a tabindex + key handler from
	// TE so keyboard users can resize the panel too.
	$effect(() => {
		if (!browser || $UIStateStore.activeSidebarTab === null) return;
		let raf = 0;
		raf = requestAnimationFrame(() => {
			const handle = document.querySelector<HTMLElement>(
				`#${SIDE_PANEL_ID} .side-panel__resize-handle`
			);
			if (!handle) return;
			handle.setAttribute('tabindex', '0');
			handle.setAttribute('aria-valuemin', String(SIDEBAR_MIN_WIDTH));
			handle.setAttribute('aria-valuemax', String(SIDEBAR_MAX_WIDTH));
			handle.setAttribute('aria-valuenow', String(sidebarWidth));
			handle.setAttribute('aria-label', 'Resize sidebar panel');
			const onKey = (e: KeyboardEvent) => {
				let delta = 0;
				if (e.key === 'ArrowLeft') delta = -SIDEBAR_KEYBOARD_STEP;
				else if (e.key === 'ArrowRight') delta = SIDEBAR_KEYBOARD_STEP;
				else if (e.key === 'Home') {
					e.preventDefault();
					sidebarWidth = SIDEBAR_MIN_WIDTH;
					handle.setAttribute('aria-valuenow', String(sidebarWidth));
					return;
				} else if (e.key === 'End') {
					e.preventDefault();
					sidebarWidth = SIDEBAR_MAX_WIDTH;
					handle.setAttribute('aria-valuenow', String(sidebarWidth));
					return;
				} else {
					return;
				}
				e.preventDefault();
				sidebarWidth = Math.min(
					SIDEBAR_MAX_WIDTH,
					Math.max(SIDEBAR_MIN_WIDTH, sidebarWidth + delta)
				);
				handle.setAttribute('aria-valuenow', String(sidebarWidth));
			};
			handle.addEventListener('keydown', onKey);
			// Cleanup via a one-shot that this effect's teardown calls.
			(handle as unknown as { _teRemove?: () => void })._teRemove = () => {
				handle.removeEventListener('keydown', onKey);
			};
		});
		return () => {
			cancelAnimationFrame(raf);
			const handle = document.querySelector<HTMLElement>(
				`#${SIDE_PANEL_ID} .side-panel__resize-handle`
			);
			const maybe = handle as unknown as { _teRemove?: () => void };
			maybe?._teRemove?.();
		};
	});

	// File upload state
	let isDraggingOver = $state(false);
	let uploadedFiles: UploadedFile[] = $state([]);
	let pendingVideoFile: File | null = $state(null);
	let pendingVideoDuration: number = $state(0);
	// Core references
	let p5Instance: p5 | null = $state(null);
	let core: Core;
	let tourOverlay: TourOverlay;

	// Example selection state. Tracks the active example by its stable id
	// (e.g. 'example-1') so both DataPanel and AppNavbar can light up the
	// matching entry from the shared EXAMPLES catalog.
	let selectedExampleId = $state('');

	// Display label for non-example transcripts (uploads, pastes, whisper,
	// restores). Example loads set selectedExampleId which takes precedence
	// in chrome; this holds the free-form label for everything else. Null
	// falls back to "Custom transcript" downstream.
	let customTranscriptLabel = $state<string | null>(null);

	// Motion state for workspace-switch fade (B3) and transcript-load fade
	// (B4). Both flags flip briefly and reset themselves via rAF / setTimeout
	// to drive the opacity transition on the main region.
	let isWorkspaceSwitching = $state(false);
	let transcriptJustLoaded = $state(false);
	let prevHasTranscript = $state(false);

	// Reactive bindings to stores
	let isVideoLoaded = $derived($VideoStore.isLoaded);
	let hasVideoSource = $derived($VideoStore.source.type !== null);
	let isTranscribeModeActive = $derived($TranscribeModeStore.isActive);

	/**
	 * Workspace-switch wrapper (B3). Flips an opacity flag briefly
	 * around the actual workspace mutation so the canvas region fades
	 * during the layout reshuffle. The CSS reduced-motion guard in
	 * app.css clamps transition-duration to 0.01ms, so motion-sensitive
	 * users see no visible fade.
	 */
	function switchWorkspace(id: Workspace) {
		isWorkspaceSwitching = true;
		applyWorkspace(id);
		requestAnimationFrame(() => {
			setTimeout(() => {
				isWorkspaceSwitching = false;
			}, 120);
		});
	}

	/**
	 * Transcript just-loaded fade (B4). When the transcript's wordArray
	 * transitions from empty → populated, flag `transcriptJustLoaded`
	 * true for a tick so the canvas region crossfades in. We read via
	 * $derived off TranscriptStore to avoid a manual subscription that
	 * would leak across HMR.
	 */
	$effect(() => {
		const nowHas = $TranscriptStore.wordArray.length > 0;
		if (nowHas && !prevHasTranscript) {
			// Flag briefly true so the canvas starts at opacity:0 this
			// frame, then flips to opacity:1 on the next tick. The CSS
			// transition on .canvas-fade-wrapper handles the fade curve.
			transcriptJustLoaded = true;
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					transcriptJustLoaded = false;
				});
			});
		}
		prevHasTranscript = nowHas;
	});

	/**
	 * Opacity driver for the canvas region. Combines the workspace-switch
	 * fade and the transcript-just-loaded fade-in. Values are kept mild
	 * (0.5 during switch, 0 at load) so the motion reads as a polish beat,
	 * not a page transition.
	 */
	let canvasOpacity = $derived(
		transcriptJustLoaded ? 0 : isWorkspaceSwitching ? 0.5 : 1
	);

	let timelineDuration = $derived(
		Math.max(0, $TimelineStore.endTime - $TimelineStore.startTime)
	);

	// speedLocked surfaces to the user that the speed multiplier is a no-op
	// while video is driving the timeline. Matches igsSketch's
	// continueTimelineAnimation branch, which prefers videoState.currentTime
	// over the animationRate-driven advance when video is playing on a
	// timed transcript.
	let scrubberSpeedLocked = $derived(
		$VideoStore.isPlaying && $TranscriptStore.timingMode !== 'untimed'
	);

	let scrubberFormatTime = $derived.by(() => {
		const isUntimed = $TranscriptStore.timingMode === 'untimed';
		return (s: number) => (isUntimed ? `${Math.round(s)} words` : formatTimeAuto(s));
	});

	// When video loads, expand timeline to accommodate video duration (only for timed transcripts)
	let prevVideoLoaded = $state(false);
	$effect(() => {
		if (isVideoLoaded && !prevVideoLoaded && $VideoStore.duration > 0) {
			if ($TranscriptStore.timingMode !== 'untimed') {
				const videoDuration = $VideoStore.duration;
				TimelineStore.update((timeline) => {
					if (videoDuration > timeline.rightMarker) {
						timeline.endTime = videoDuration;
						timeline.rightMarker = videoDuration;
					}
					return timeline;
				});
			}
		}
		prevVideoLoaded = isVideoLoaded;
	});

	// Store subscriptions
	P5Store.subscribe((value) => {
		p5Instance = value;
		if (p5Instance) {
			core = new Core(p5Instance);
		}
	});

	// Auto-save subscriptions - save when transcript or users change
	let isRestoringState = $state(false);
	TranscriptStore.subscribe(() => {
		if (!isRestoringState) saveStateDebounced();
	});
	UserStore.subscribe(() => {
		if (!isRestoringState) saveStateDebounced();
	});
	CodeStore.subscribe(() => {
		if (!isRestoringState) saveStateDebounced();
	});

	onMount(() => {
		recoveryTimestamp = getPersistedTimestamp();
		if (recoveryTimestamp !== null) {
			showRecoveryModal = true;
		}

		// Hydrate theme store from localStorage and wire the system-preference
		// listener. app.html already sets <html data-theme> inline to avoid FOUC;
		// this call reconciles the Svelte-side state with what's on the DOM and
		// keeps them in sync if the OS preference flips while 'system' is chosen.
		const teardownTheme = initThemeSystem();

		window.addEventListener('beforeunload', saveStateImmediate);

		// Workspace keyboard shortcuts: 1 / 2 / 3 switch between Analyze /
		// Code / Present. Skip while the user is editing text (inputs,
		// textareas, contenteditable) so we don't yank focus mid-type. Skip
		// when a modifier is held to avoid colliding with browser shortcuts
		// like Cmd+1 (tab-switch) or Ctrl+Alt+1 (assistive tech).
		const handleWorkspaceShortcut = (event: KeyboardEvent) => {
			if (event.ctrlKey || event.metaKey || event.altKey) return;
			const target = event.target as HTMLElement | null;
			if (target) {
				const tag = target.tagName;
				if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
				if (target.isContentEditable) return;
			}
			const idx = event.key === '1' ? 0 : event.key === '2' ? 1 : event.key === '3' ? 2 : -1;
			if (idx < 0) return;
			const workspace: Workspace = WORKSPACE_ORDER[idx];
			event.preventDefault();
			switchWorkspace(workspace);
		};
		window.addEventListener('keydown', handleWorkspaceShortcut);

		return () => {
			window.removeEventListener('beforeunload', saveStateImmediate);
			window.removeEventListener('keydown', handleWorkspaceShortcut);
			teardownTheme();
		};
	});

	function handleRestore() {
		isRestoringState = true;
		restoreState();

		const { wordArray } = get(TranscriptStore);
		const maxTime = getMaxTime(wordArray);
		TimelineStore.update((t) => ({
			...t,
			currTime: 0,
			startTime: 0,
			endTime: maxTime,
			leftMarker: 0,
			rightMarker: maxTime,
			isAnimating: false
		}));

		requestAnimationFrame(() => {
			triggerCanvasResize();
			p5Instance?.fillAllData?.();
			isRestoringState = false;
		});
	}

	const sketch: SketchFn = (p5: p5) => {
		igsSketch(p5);
	};

	// Refresh data when filter toggles change
	$effect(() => {
		$filterToggleKey;
		if (browser) p5Instance?.fillSelectedData();
	});

	// Sync visualization hover to editor selection (scroll editor to hovered turn)
	// Use get() for EditorStore to avoid reactive dependency cycle (this effect writes to EditorStore)
	$effect(() => {
		const hovered = $HoverStore.hoveredDataPoint;
		if (hovered && get(EditorStore).config.isVisible) {
			EditorStore.update((state) => ({
				...state,
				selection: {
					...state.selection,
					selectedTurnNumber: hovered.turnNumber,
					selectionSource: 'visualization'
				}
			}));
		}
	});

	// Resize canvas when editor layout changes
	$effect(() => {
		$editorLayoutKey;
		if (browser) requestAnimationFrame(() => triggerCanvasResize());
	});

	// Resize canvas when exiting transcribe mode (fillAllData is handled by igsSketch setup)
	let prevTranscribeModeActive = $state(false);
	$effect(() => {
		if (prevTranscribeModeActive && !isTranscribeModeActive) {
			requestAnimationFrame(() => triggerCanvasResize());
		}
		prevTranscribeModeActive = isTranscribeModeActive;
	});

	// ============ Event Handlers ============

	async function handleLoadExample(exampleId: string) {
		const example = core?.getExample(exampleId);
		if (!example || !core) return;

		try {
			clearState(); // Clear auto-save when intentionally loading new data
			core.resetVideo();

			// Load each CSV file for the example
			for (const fileName of example.files) {
				const file = await core.fetchExampleFile(exampleId, fileName);
				await processFile(file, { skipPreview: true });
			}

			// Load example video
			if (example.videoId) {
				core.loadExampleVideo(example.videoId);
			}

			// Record the active example id so chrome that surfaces a
			// selection indicator (DataPanel, AppNavbar examples menu) can
			// light up the matching entry.
			selectedExampleId = exampleId;
			// Clear any custom-transcript label so the nav resolves to the
			// example label rather than a stale upload filename.
			customTranscriptLabel = null;

			// Record in Recents for the Transcript dropdown, and surface
			// a low-key confirmation so the user knows the load completed
			// (the canvas itself fades in via B4 but that's ambient).
			const label = EXAMPLE_LABELS[exampleId] ?? exampleId;
			recents.push({ id: exampleId, label, kind: 'example' });
			pushToast(`Loaded ${label}`, 'success');
		} catch (error) {
			notifications.error('Error loading example. Please check your internet connection.');
			pushToast('Failed to load example', 'error');
			console.error('Example load error:', error);
		}
	}

	/**
	 * Record a custom (non-example) transcript in recents + set the
	 * display label for the nav center region. Called from upload /
	 * paste / whisper paths so the nav and Recents list stay in sync
	 * without reaching into transcript-lifecycle (owned by the parallel
	 * perf agent).
	 */
	function recordCustomLoad(label: string, kind: 'upload' = 'upload') {
		if (!label) return;
		customTranscriptLabel = label;
		selectedExampleId = '';
		// Use the label as the recent's stable id — uploads don't have
		// a catalog id, and dedupe by (kind, id) in the store keeps
		// repeated loads of the same file from piling up.
		recents.push({ id: label, label, kind });
		pushToast(`Loaded ${label}`, 'success');
	}

	function handlePanelResize(data: { sizes: [number, number] }) {
		EditorStore.update((state) => ({
			...state,
			config: {
				...state.config,
				panelSizes: data.sizes
			}
		}));
		triggerCanvasResize();
	}

	// ============ Transcript Creation ============

	// Create a new transcript (always timed - user can switch to untimed if needed)
	function createTranscript() {
		clearState(); // Clear auto-save when intentionally creating new transcript
		core.clearTranscriptData();

		const { transcript, users } = createEmptyTranscript(USER_COLORS[0]);

		// Use video duration if loaded, otherwise default to 60 seconds
		const videoDuration = get(VideoStore).duration;
		const timelineEnd = get(VideoStore).isLoaded && videoDuration > 0 ? videoDuration : 60;

		transcript.timingMode = 'startEnd';
		transcript.totalTimeInSeconds = timelineEnd;

		UserStore.set(users);
		TranscriptStore.set(transcript);

		TimelineStore.update((t) => ({
			...t,
			currTime: 0,
			startTime: 0,
			endTime: timelineEnd,
			leftMarker: 0,
			rightMarker: timelineEnd,
			isAnimating: false
		}));

		EditorStore.update((state) => ({
			...state,
			config: { ...state.config, isVisible: true }
		}));

		requestAnimationFrame(() => {
			triggerCanvasResize();
			p5Instance?.fillAllData?.();
		});
	}

	function handleTranscriptionComplete(result: TranscriptionResult) {
		try {
			if (!result.segments || result.segments.length === 0) {
				notifications.error('Transcription produced no results. The audio may be too short or unclear.');
				return;
			}

			clearState(); // Clear auto-save when creating transcript from transcription
			core.clearTranscriptData();

			const transcriptionLabel = pendingVideoFile?.name ?? 'Transcription';
			applyTranscriptResult(createTranscriptFromWhisper(result.segments, pendingVideoDuration, USER_COLORS[0]), pendingVideoDuration);
			recordCustomLoad(transcriptionLabel);
			openEditor();
		} catch (error) {
			notifications.error('Failed to process transcription results.');
			console.error('Transcription processing error:', error);
		} finally {
			pendingVideoFile = null;
			pendingVideoDuration = 0;
		}
	}

	function handlePasteImport(parseResult: ParseResult) {
		try {
			if (!parseResult.turns || parseResult.turns.length === 0) {
				notifications.error('No valid turns found in pasted text.');
				return;
			}

			clearState(); // Clear auto-save when importing from paste
			core.clearTranscriptData();

			applyTranscriptResult(createTranscriptFromParsedText(parseResult));
			recordCustomLoad('Pasted transcript');
			openEditor();
		} catch (error) {
			notifications.error('Failed to import pasted transcript.');
			console.error('Paste import error:', error);
		}
	}

	// ============ File Upload ============

	function updateUserLoadedFiles(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files) {
			processFiles(Array.from(input.files));
		}
		input.value = '';
	}

	async function processFiles(fileList: File[]) {
		const newEntries = createUploadEntries(fileList);
		uploadedFiles = [...uploadedFiles, ...newEntries];

		for (let i = 0; i < fileList.length; i++) {
			const file = fileList[i];
			const fileIndex = uploadedFiles.length - fileList.length + i;

			uploadedFiles[fileIndex].status = 'processing';
			uploadedFiles = uploadedFiles;

			try {
				await processFile(file);
				if (codePreview && codePreview.fileName === file.name) {
					uploadedFiles[fileIndex].type = 'Codes (CSV)';
				}
				uploadedFiles[fileIndex].status = 'done';
			} catch (err) {
				uploadedFiles[fileIndex].status = 'error';
				const errorMessage = err instanceof Error ? err.message : 'Unknown error';
				uploadedFiles[fileIndex].error = errorMessage;
				notifications.error(errorMessage);
			}
			uploadedFiles = uploadedFiles;
		}
	}

	function readFileAsText(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				const text = e.target?.result as string;
				if (!text) reject(new Error(`Failed to read file: ${file.name}`));
				else resolve(text);
			};
			reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
			reader.readAsText(file);
		});
	}

	function parseCSVFile(file: File): Promise<Papa.ParseResult<Record<string, unknown>>> {
		return new Promise((resolve, reject) => {
			Papa.parse(file, {
				dynamicTyping: true,
				skipEmptyLines: 'greedy',
				header: true,
				transformHeader: (h: string) => h.trim().toLowerCase(),
				complete: resolve,
				error: (error: Error) => reject(new Error(`CSV parsing error: ${error.message}`))
			});
		});
	}

	async function processFile(file: File, { skipPreview = false } = {}): Promise<void> {
		const fileName = file.name.toLowerCase();

		if (fileName.endsWith('.csv') || file.type === 'text/csv') {
			const results = await parseCSVFile(file);

			// Check if this is a code file (before checking transcript)
			if (testCodeFile(results)) {
				if (skipPreview) {
					const fields = results.meta.fields || [];
					const formatLabel = getCodeFormatLabel(fields);
					if (formatLabel === 'Unknown') {
						throw new Error('Unrecognized code file format. Expected columns: "turn" + "code", "turn_start" + "turn_end" + "code", or "start" + "end".');
					}
					applyCodeFileResults(results, file.name);
					return;
				}

				const fields = results.meta.fields || [];
				const rows = results.data as Record<string, unknown>[];
				const formatLabel = getCodeFormatLabel(fields);
				const transcript = get(TranscriptStore);

				let error: string | null = null;
				if (formatLabel === 'Unknown') {
					error = 'Unrecognized code file format. Expected columns: "turn" + "code", "turn_start" + "turn_end" + "code", or "start" + "end".';
				} else if (transcript.wordArray.length === 0) {
					error = 'Load a transcript first, then load a code file to apply codes to it.';
				} else if (formatLabel === 'Time-based' && transcript.timingMode === 'untimed') {
					error = 'Time-based code files require a timed transcript. Use turn-based codes for untimed transcripts.';
				}

				codePreview = {
					fileName: file.name,
					formatLabel,
					rawRows: rows.slice(0, PREVIEW_ROW_COUNT),
					allColumns: fields,
					codeNames: extractCodeNames(rows, fields, file.name),
					rowCount: rows.length,
					papaResults: results,
					error
				};
				return;
			}

			const allColumns = results.meta.fields || [];
			const rawData = results.data as Record<string, unknown>[];
			const columnMatches = mapColumns(allColumns);
			const columnOverrides: Record<string, string | null> = {};

			if (skipPreview) {
				// For examples / skip-preview: require exact matches
				const isValid = testTranscript(results);
				if (!isValid) {
					throw new Error('Invalid CSV format. Required columns: "speaker" and "content".');
				}
				const speechRate = get(AppSettingsStore).speechRateWordsPerSecond;
				const parseResult = parseCSVRows(results.data, speechRate);
				if (parseResult.turns.length === 0) {
					throw new Error('No valid turns found in CSV. Check that rows have speaker and content values.');
				}
				clearState();
				core.clearTranscriptData();
				applyTranscriptResult(createTranscriptFromParsedText(parseResult, parseResult.detectedTimingMode));
				// Examples route through handleLoadExample, which records its
				// own recent + toast; single-file uploads that skip preview
				// (rare — mostly examples) are the other caller. Avoid
				// double-toasting for examples by only recording when no
				// example is actively loading. We detect by checking the
				// current selectedExampleId before this call returns via
				// handleLoadExample's own post-processing.
			} else {
				// Build preview with column mapping
				const preview: CSVPreview = {
					fileName: file.name,
					rawRows: rawData.slice(0, PREVIEW_ROW_COUNT),
					allColumns,
					columnMatches,
					columnOverrides,
					rawData,
					parseResult: null,
					speakerCount: 0,
					turnCount: 0,
					wordCount: 0,
					timingMode: null,
					error: null
				};
				csvPreview = recomputePreviewStats(preview);
			}
		} else if (fileName.endsWith('.txt')) {
			const text = await readFileAsText(file);
			const parseResult = parseTXTLines(text.split(/\r?\n/));
			if (parseResult.turns.length === 0) {
				throw new Error('No valid turns found in text file. Expected format: "Speaker: content"');
			}
			clearState();
			core.clearTranscriptData();
			applyTranscriptResult(createTranscriptFromParsedText(parseResult));
			recordCustomLoad(file.name);
		} else if (fileName.endsWith('.mp4') || file.type === 'video/mp4') {
			pendingVideoFile = file;
			core.prepVideoFromFile(URL.createObjectURL(file));
			const pollDuration = (elapsed: number) => {
				const duration = get(VideoStore).duration;
				if (duration > 0) {
					pendingVideoDuration = duration;
				} else if (elapsed < 5000) {
					setTimeout(() => pollDuration(elapsed + 200), 200);
				}
			};
			pollDuration(0);
		} else if (fileName.endsWith('.srt') || fileName.endsWith('.vtt')) {
			const text = await readFileAsText(file);
			const parseResult = parseSubtitleText(text);
			if (parseResult.turns.length === 0) {
				throw new Error('No valid subtitles found in file. Check the file format.');
			}
			clearState();
			core.clearTranscriptData();
			applyTranscriptResult(createTranscriptFromSubtitle(parseResult, USER_COLORS[0]));
			recordCustomLoad(file.name);
		} else {
			throw new Error('Unsupported file format');
		}
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDraggingOver = false;
		if (event.dataTransfer?.files) {
			const validFiles = filterValidFiles(Array.from(event.dataTransfer.files));
			if (validFiles.length > 0) {
				processFiles(validFiles);
			}
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		isDraggingOver = true;
	}

	function handleDragLeave() {
		isDraggingOver = false;
	}

	function openFileDialog() {
		const input = document.getElementById('file-input') as HTMLInputElement;
		input?.click();
	}

	function clearUploadedFiles() {
		uploadedFiles = [];
	}

	// ============ Canvas Context Menu ============

	// Live reactive subscription to the context-menu slice. Pulled as
	// derived fields so the ContextMenu binding stays trivial and we keep
	// the menu rendering a single source of truth.
	let contextMenuState = $derived($UIStateStore.contextMenu);
	let contextMenuPayload = $derived(contextMenuState.payload);
	let contextMenuAnchor = $derived(
		contextMenuState.open ? { x: contextMenuState.x, y: contextMenuState.y } : null
	);

	function buildContextMenuItems(payload: ContextMenuPayload | null): ContextMenuItem[] {
		if (!payload) return [];
		const speakerSuffix = payload.speakerId ? ` (${payload.speakerId})` : '';
		const speakerLabel = payload.speakerId ? `Filter to ${payload.speakerId}` : 'Filter to speaker';
		const filterDisabled = !payload.speakerId;

		if (payload.kind === 'word') {
			return [
				{ id: 'seek', label: `Seek video here${speakerSuffix}` },
				{ id: 'in-point', label: 'Set in-point here' },
				{ id: 'out-point', label: 'Set out-point here' },
				{ id: 'filter-speaker', label: speakerLabel, disabled: filterDisabled },
				{ id: 'search-word', label: `Search "${payload.word}"` }
			];
		}
		// glyph + turn share the same actions today
		return [
			{ id: 'seek', label: `Seek video here${speakerSuffix}` },
			{ id: 'in-point', label: 'Set in-point here' },
			{ id: 'out-point', label: 'Set out-point here' },
			{ id: 'filter-speaker', label: speakerLabel, disabled: filterDisabled },
			{ id: 'apply-code', label: 'Apply code…' }
		];
	}

	let contextMenuItems = $derived(buildContextMenuItems(contextMenuPayload));

	function closeContextMenu() {
		UIStateStore.update((s) => ({
			...s,
			contextMenu: { ...s.contextMenu, open: false, payload: null }
		}));
	}

	// ============ First-load Welcome Dialog ============

	// Gate the dialog on `browser` so it never renders during SSR. On the
	// client, onboardingState is seeded from localStorage at module init,
	// so by the time this hydrates it reflects the real persisted value.
	let welcomeOpen = $derived(browser && $UIStateStore.onboardingState === 'unseen');

	function handleWelcomeStartTour() {
		// User opted into the tour — mark onboarding as seen (not
		// dismissed — they engaged) and then hand off to the shared tour
		// entry point that HelpPanel also uses.
		UIStateStore.update((s) => ({ ...s, onboardingState: 'seen' }));
		setSidebarTab(null);
		tourOverlay.start();
	}

	function handleWelcomeDismiss(dontShowAgain: boolean) {
		// If the user left the default-checked "don't show again" on, flip
		// to 'dismissed' so the dialog stays gone. If they unchecked it,
		// leave onboardingState at 'unseen' so the dialog returns next
		// reload. We intentionally DON'T write 'unseen' back explicitly —
		// it's already the current value; a no-op write would churn the
		// localStorage subscribe needlessly.
		if (dontShowAgain) {
			UIStateStore.update((s) => ({ ...s, onboardingState: 'dismissed' }));
		}
	}

	function resetOnboarding() {
		// HelpPanel's "Show welcome again" affordance. Flipping the state
		// back to 'unseen' is enough — the $derived `welcomeOpen` will
		// react and re-show the dialog immediately.
		UIStateStore.update((s) => ({ ...s, onboardingState: 'unseen' }));
	}

	function handleContextMenuSelect(id: string) {
		const payload = contextMenuPayload;
		if (!payload) {
			closeContextMenu();
			return;
		}

		switch (id) {
			case 'seek': {
				// Move the visualization playhead, and — if a video is
				// loaded — fire a video seek via playFrom. playFrom only
				// reads .startTime off the DataPoint, so constructing a
				// minimal DataPoint here is safe.
				const startTime = get(TimelineStore).startTime;
				handleScrubberSeek(payload.time - startTime);
				if (get(VideoStore).isLoaded) {
					const dp = new DataPoint(
						payload.kind === 'word' ? (payload.speakerId ?? '') : (payload.speakerId ?? ''),
						-1,
						payload.kind === 'word' ? payload.word : '',
						payload.time,
						payload.time
					);
					playFrom(dp);
				}
				break;
			}
			case 'in-point': {
				// Set the selection's in-point to the clicked time. Clamp to
				// the transcript's world range [startTime, endTime]; if the
				// new in-point would cross the current out-point, push the
				// out-point with it (same behavior the scrubber uses when a
				// handle drag would invert the selection). Also realign
				// currTime so the playhead stays inside the new range —
				// matches handleSelectionChange in scrubber-bridge. Without
				// this, setting an in-point ahead of the playhead would
				// leave the viz animating past the right marker and the
				// user would see no visible change on the scrubber handle.
				TimelineStore.update((t) => {
					const nextLeft = Math.max(t.startTime, Math.min(payload.time, t.endTime));
					const nextRight = Math.max(nextLeft, t.rightMarker);
					return {
						...t,
						leftMarker: nextLeft,
						rightMarker: nextRight,
						currTime:
							t.currTime < nextLeft
								? nextLeft
								: t.currTime > nextRight
									? nextRight
									: t.currTime
					};
				});
				// Force a viz refilter on the new range. The draw loop re-
				// reads leftMarker/rightMarker each frame, but explicitly
				// nudging fillSelectedData keeps the cached scaling / cloud
				// buffer in step when animation isn't running.
				p5Instance?.fillSelectedData?.();
				break;
			}
			case 'out-point': {
				// Symmetric to in-point: clamp to the world range and push
				// leftMarker back if the new out-point would invert. Clamp
				// currTime too so the playhead doesn't sit past the new
				// right edge (which would trip endTimelineAnimation and
				// snap the playhead back to leftMarker on the next frame).
				TimelineStore.update((t) => {
					const nextRight = Math.max(t.startTime, Math.min(payload.time, t.endTime));
					const nextLeft = Math.min(t.leftMarker, nextRight);
					return {
						...t,
						leftMarker: nextLeft,
						rightMarker: nextRight,
						currTime:
							t.currTime < nextLeft
								? nextLeft
								: t.currTime > nextRight
									? nextRight
									: t.currTime
					};
				});
				p5Instance?.fillSelectedData?.();
				break;
			}
			case 'filter-speaker': {
				if (payload.speakerId) filterToSpeaker(payload.speakerId);
				break;
			}
			case 'search-word': {
				if (payload.kind === 'word') {
					FiltersStore.update((f) => ({ ...f, wordToSearch: payload.word }));
				}
				break;
			}
			case 'apply-code': {
				// TODO(Phase E.1): open a secondary code-picker. The codes
				// system spans CodeStore + code-utils + multi-format parsing
				// and is out of scope for the context-menu landing.
				console.log('[ContextMenu] Apply code… not yet wired', payload);
				break;
			}
		}

		closeContextMenu();
	}

</script>

<svelte:head>
	<title>Transcript Explorer</title>
</svelte:head>

{#snippet vizIcon()}<LayoutDashboard size={20} />{/snippet}
{#snippet filtersIcon()}<Filter size={20} />{/snippet}
{#snippet dataIcon()}<Database size={20} />{/snippet}
{#snippet settingsIcon()}<SettingsIcon size={20} />{/snippet}
{#snippet helpIcon()}<CircleHelp size={20} />{/snippet}

{#if isTranscribeModeActive}
	<TranscribeModeLayout onexit={exitTranscribeMode} oncreateTranscript={createTranscript} />
{:else}
	<!-- Skip link: visually hidden until keyboard-focused, jumps past
	     the navbar + activity bar straight into the canvas region. -->
	<a class="te-skip-link" href="#main-content">Skip to main content</a>
	<div class="page-frame">
		<CanvasFrame>
			{#snippet top()}
				<AppNavbar
					{isVideoLoaded}
					activeWorkspace={$UIStateStore.activeWorkspace}
					selectedExampleId={selectedExampleId}
					transcriptLabel={customTranscriptLabel ?? ''}
					ontoggleTranscribeMode={toggleTranscribeMode}
					onselectWorkspace={switchWorkspace}
					onopenDataPanel={openDataPanelForLoading}
					onopenUpload={() => (showUploadModal = true)}
					onopenPaste={() => (showPasteModal = true)}
					oncreateNew={() => (showNewTranscriptConfirm = true)}
					onloadExample={handleLoadExample}
				/>
			{/snippet}

			{#snippet leftRail()}
				<nav class="te-left-rail" data-tour="viz-modes" aria-label="Sidebar navigation">
					<ActivityBar
						activeId={$UIStateStore.activeSidebarTab ?? undefined}
						onSelect={handleActivitySelect}
						items={[
							{ id: 'viz', label: 'Visualizations', icon: vizIcon },
							{ id: 'filters', label: 'Filters', icon: filtersIcon },
							{ id: 'data', label: 'Data', icon: dataIcon },
							{ id: 'settings', label: 'Settings', icon: settingsIcon },
							{ id: 'help', label: 'Help', icon: helpIcon }
						]}
					/>
					{#if $UIStateStore.activeSidebarTab !== null}
						<!-- The library SidePanel renders its own <aside>. We wrap
						     it in a role="tabpanel" container so ActivityBar's
						     role="tab" items conceptually complete the tablist →
						     tabpanel relationship. The library ActivityBar does
						     not expose per-item DOM ids, so we label this panel
						     directly via aria-label rather than aria-labelledby. -->
						<div
							id={SIDE_PANEL_ID}
							role="tabpanel"
							aria-label={`${activeSidebarLabel} panel`}
							class="te-sidepanel-shell"
						>
						<SidePanel
							open={true}
							title={activeSidebarLabel}
							bind:width={sidebarWidth}
							onClose={() => setSidebarTab(null)}
						>
							<!-- Motion polish (B1 + B2): the library SidePanel
							     slides in on open; this #key block re-runs the
							     inner fade on each tab switch so content
							     crossfades rather than snapping. The delay on
							     fade-in stages the content arrival after the
							     slide completes. -->
							{#key $UIStateStore.activeSidebarTab}
								<div
									in:fade={{ duration: 140, delay: 60 }}
									out:fade={{ duration: 80 }}
								>
									{#if $UIStateStore.activeSidebarTab === 'viz'}
										<VizPanel />
									{:else if $UIStateStore.activeSidebarTab === 'filters'}
										<FiltersPanel />
									{:else if $UIStateStore.activeSidebarTab === 'data'}
										<DataPanel
											selectedExample={selectedExampleId}
											onOpenUpload={() => (showUploadModal = true)}
											onOpenPaste={() => (showPasteModal = true)}
											onCreateNew={() => (showNewTranscriptConfirm = true)}
											onLoadExample={handleLoadExample}
										/>
									{:else if $UIStateStore.activeSidebarTab === 'settings'}
										<SettingsPanel />
									{:else if $UIStateStore.activeSidebarTab === 'help'}
										<HelpPanel
											onLoadExample={(id) => {
												handleLoadExample(id);
												setSidebarTab(null);
											}}
											onOpenUpload={() => {
												showUploadModal = true;
												setSidebarTab(null);
											}}
											onOpenPaste={() => {
												showPasteModal = true;
												setSidebarTab(null);
											}}
											onStartTour={() => {
												setSidebarTab(null);
												tourOverlay.start();
											}}
											onShowWelcome={() => {
												setSidebarTab(null);
												resetOnboarding();
											}}
										/>
									{/if}
								</div>
							{/key}
							</SidePanel>
						</div>
					{/if}
				</nav>
			{/snippet}

			{#snippet canvas()}
				<!-- Motion wrapper (B3 + B4): binds opacity to canvasOpacity
				     so workspace switches fade to 0.5 briefly and first
				     transcript loads crossfade 0 → 1. The CSS transition
				     is 160ms / ease-out; app.css's reduced-motion guard
				     clamps the duration for motion-sensitive users. -->
				<div class="canvas-fade-wrapper" style="opacity: {canvasOpacity};">
				<SplitPane
					orientation={$EditorStore.config.orientation}
					sizes={$EditorStore.config.panelSizes}
					collapsed={!$EditorStore.config.isVisible}
					collapsedPanel="second"
					onresize={handlePanelResize}
				>
					{#snippet first()}
						<main
							class="h-full relative"
							id="main-content"
							tabindex="-1"
							aria-label="Transcript visualization workspace"
						>
						<div
							class="h-full relative"
							id="p5-container"
							data-tour="visualization"
						>
							<!-- SR-only description so a screen-reader user knows
							     a canvas-rendered visualization lives here. Using
							     a hidden caption avoids role="img" on the outer
							     container, which would suppress the legend and
							     tooltip from the accessibility tree. -->
							<p class="sr-only">Transcript visualization canvas. Interactive p5 visualization of transcript turns; use the Filters panel to refine and the Timeline controls to navigate.</p>
							<Sketch {sketch} bind:instance={p5Instance} />
							<CanvasTooltip />
							<VisualizationLegend />
							{#if $VizStore.dashboardToggle}
								<DashboardOverlay />
							{/if}
							{#each $HoverStore.overflowBounds as b}
								<div
									class="badge badge-neutral absolute"
									style="left: {b.x + b.width - 12}px; top: {b.y + b.height - 12}px; transform: translate(-100%, -100%);"
								>
									Some content not shown
								</div>
							{/each}
							{#if hasVideoSource}
								<VideoContainer />
							{/if}
							<!--
								Empty-canvas CTA: since Upload/New moved off the top nav
								into DataPanel, surface a prominent action here so first-
								time users have a clear next step on a blank canvas.
								Opens the Data sidebar and hands focus to Upload.
							-->
							{#if $TranscriptStore.wordArray.length === 0}
								<div
									class="empty-canvas-cta"
									role="status"
									aria-live="polite"
									data-tour="examples"
								>
									<p class="empty-canvas-cta__msg">No transcript loaded</p>
									<button
										type="button"
										class="te-btn te-btn--primary"
										onclick={openDataPanelForLoading}
									>
										Load transcript
									</button>
								</div>
							{/if}
						</div>
						</main>
					{/snippet}
					{#snippet second()}
						<div class="h-full">
							<TranscriptEditor oncreateTranscript={createTranscript} />
						</div>
					{/snippet}
				</SplitPane>
				</div>
			{/snippet}

			{#snippet bottom()}
				<div
					class="te-bottom-bar min-h-20"
					style="background: var(--te-bg-muted);"
					data-tour="timeline"
					role="region"
					aria-label="Timeline controls"
				>
					<div class="te-timeline-side min-w-0 w-full flex items-center">
						<TimelineScrubber
							duration={timelineDuration}
							currentTime={$TimelineStore.currTime - $TimelineStore.startTime}
							isPlaying={$TimelineStore.isAnimating}
							speed={$AppSettingsStore.animationRate}
							speedOptions={[1, 3, 6, 15, 30]}
							speedLocked={scrubberSpeedLocked}
							speedLockedReason="Video is playing; the timeline follows media playback and the speed multiplier is temporarily inactive."
							selectionStart={$TimelineStore.leftMarker - $TimelineStore.startTime}
							selectionEnd={$TimelineStore.rightMarker - $TimelineStore.startTime}
							formatTime={scrubberFormatTime}
							onSeek={handleScrubberSeek}
							onPlayToggle={handleScrubberPlayToggle}
							onSpeedChange={handleScrubberSpeedChange}
							onSelectionChange={handleSelectionChange}
							onSelectionCommit={handleSelectionCommit}
						/>
					</div>
				</div>
			{/snippet}
		</CanvasFrame>

		<UploadModal
			bind:isOpen={showUploadModal}
			{isDraggingOver}
			{pendingVideoFile}
			{uploadedFiles}
			{csvPreview}
			{codePreview}
			ondrop={handleDrop}
			ondragover={handleDragOver}
			ondragleave={handleDragLeave}
			onopenFileDialog={openFileDialog}
			onclearFiles={clearUploadedFiles}
			onstartTranscription={() => (showTranscriptionModal = true)}
			onyoutubeUrl={(videoId) => loadVideo({ type: 'youtube', videoId })}
			onopenPasteModal={() => {
				showUploadModal = false;
				showPasteModal = true;
			}}
			onconfirmImport={confirmCSVImport}
			oncancelPreview={cancelCSVPreview}
			oncolumnMappingChange={handleColumnMappingChange}
			onconfirmCodeImport={confirmCodeImport}
			oncancelCodePreview={cancelCodePreview}
		/>

		<PasteModal bind:isOpen={showPasteModal} onimport={handlePasteImport} />

		<ConfirmModal
			bind:isOpen={showNewTranscriptConfirm}
			title="Create New Transcript?"
			message="This will erase the current transcript. This action cannot be undone."
			confirmText="Erase and Create New"
			onconfirm={createTranscript}
		/>
	</div>
{/if}

<input class="hidden" id="file-input" multiple accept=".csv, .txt, .mp4, .srt, .vtt" type="file" onchange={updateUserLoadedFiles} />

<TranscriptionModal
	bind:isOpen={showTranscriptionModal}
	videoFile={pendingVideoFile}
	videoDuration={pendingVideoDuration}
	oncomplete={handleTranscriptionComplete}
	onclose={() => (showTranscriptionModal = false)}
/>

<TourOverlay bind:this={tourOverlay} />

<!--
	First-load welcome dialog. Shown when onboardingState === 'unseen'.
	Gated on `browser` to avoid SSR rendering; onboardingState is
	hydrated from localStorage at store-module init, so by the time we
	hydrate on the client this reflects the real persisted value.
-->
<WelcomeDialog
	open={welcomeOpen}
	onStartTour={handleWelcomeStartTour}
	onDismiss={handleWelcomeDismiss}
/>

<RecoveryModal bind:isOpen={showRecoveryModal} savedAt={recoveryTimestamp} onrestore={handleRestore} ondiscard={handleDiscard} />

<!--
	Root-level toast portal (B6). Non-blocking one-line notifications
	for low-stakes feedback like "Loaded <example>". Separate from the
	existing NotificationStore/ToastContainer which handles alert-style
	messages at top-center; this stack lives bottom-right and uses the
	pushToast(message, kind, durationMs) API from $stores/toastStore.
-->
<Toast />

<!--
	Canvas context menu. Rendered at the page root so it can float over the
	CanvasFrame regions, modals-aside. State lives on UIStateStore; open =
	true is set by igsSketch's single-click handler.
-->
<ContextMenu
	open={contextMenuState.open}
	anchor={contextMenuAnchor}
	items={contextMenuItems}
	onSelect={handleContextMenuSelect}
	onClose={closeContextMenu}
/>

<style>
	.page-frame {
		height: 100vh;
		width: 100%;
		overflow: hidden;
	}

	.te-left-rail {
		display: flex;
		flex-direction: row;
		align-items: stretch;
		height: 100%;
	}

	.te-sidepanel-shell {
		display: flex;
		height: 100%;
		min-height: 0;
	}

	/* Timeline region (bottom bar): inset the TimelineScrubber from the
	   viewport edges so the full-width scrubber has breathing room, and
	   add a hairline top border to separate it from the canvas above.
	   Horizontal inset drops at very narrow widths to avoid cramming. */
	.te-bottom-bar {
		padding: var(--te-sp-2) var(--te-sp-3);
		border-top: 1px solid var(--te-border-muted);
	}

	@media (max-width: 640px) {
		.te-bottom-bar {
			padding-left: var(--te-sp-2);
			padding-right: var(--te-sp-2);
		}
	}

	/* Remove the default focus outline on <main> when focus-jumped to
	   from the skip-link; the visible focus ring isn't useful on a
	   page-level landmark, and its tabindex="-1" is only there for
	   programmatic focus. */
	#main-content:focus,
	#main-content:focus-visible {
		outline: none;
	}

	.empty-canvas-cta {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--te-sp-3);
		padding: var(--te-sp-5);
		background: var(--te-bg);
		border: 1px solid var(--te-border-muted);
		border-radius: var(--te-radius-lg);
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
		pointer-events: auto;
		z-index: 2;
	}

	.empty-canvas-cta__msg {
		margin: 0;
		color: var(--te-fg-muted);
		font-size: var(--te-font-body);
	}

	/* Motion wrapper for the canvas region. Opacity is bound inline
	   so SSR paints at the right value; the transition here carries
	   the fade on change. Height:100% so SplitPane still fills. */
	.canvas-fade-wrapper {
		height: 100%;
		transition: opacity 160ms ease-out;
	}
</style>
