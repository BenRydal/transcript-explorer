import P5Store from '../../stores/p5Store';
import TranscriptStore from '../../stores/transcriptStore.js';
import UserStore from '../../stores/userStore';
import TimelineStore from '../../stores/timelineStore';
import VizStore from '../../stores/vizStore';
import AppSettingsStore from '../../stores/appSettingsStore';
import HoverStore, { type HoverState } from '../../stores/hoverStore';
import EditorStore from '../../stores/editorStore';
import VideoStore from '../../stores/videoStore';
import type { VideoState } from '../../stores/videoStore';
import UIStateStore, { type ContextMenuPayload } from '../../stores/uiStateStore';
import { handleVisualizationClick } from '../video/video-interaction';
import { Draw } from '../draw/draw';
import { DynamicData } from '../core/dynamic-data';
import { getP5ContainerRect } from '../core/layout-utils';
import { getDrawTheme, refreshDrawTheme } from '../draw/draw-theme';
import { hitTest } from 'svelte-p5';

let users: any[] = [];
let timeline, transcript, currConfig, editorState;
let hoverState: HoverState;
let videoState: VideoState;
let canHover = true;
let mouseEventLocked = false;
let themeObserver: MutationObserver | null = null;
let contextMenuHandler: ((e: MouseEvent) => void) | null = null;
let contextMenuCanvasEl: HTMLCanvasElement | null = null;
let pointerMoveHandler: ((e: PointerEvent) => void) | null = null;

TimelineStore.subscribe((data) => {
	timeline = data;
});

UserStore.subscribe((data) => {
	users = data;
});

// Merged snapshot of the viz + app-settings fields this module reads (viz
// toggles + animationRate). Kept as a merged object so existing `currConfig.X`
// reads resolve regardless of which underlying store owns the field.
VizStore.subscribe((data) => {
	currConfig = { ...currConfig, ...data };
});
AppSettingsStore.subscribe((data) => {
	currConfig = { ...currConfig, ...data };
});

HoverStore.subscribe((data) => {
	hoverState = data;
});

TranscriptStore.subscribe((data) => {
	transcript = data;
});

VideoStore.subscribe((data) => {
	videoState = data;
});

EditorStore.subscribe((data) => {
	editorState = data;
});

export const igsSketch = (p5: any) => {
	P5Store.set(p5);

	p5.preload = () => {
		p5.font = p5.loadFont('/fonts/PlusJakartaSans/VariableFont_wght.ttf');
	};

	p5.setup = () => {
		const { width, height } = p5.getContainerSize();
		p5.createCanvas(width, height);
		p5.dynamicData = new DynamicData();
		p5.renderer = new Draw(p5);
		p5.toolTipTextSize = 30;
		p5.textFont(p5.font);
		p5.animationCounter = 0; // controls animation of data

		// Track whether the mouse is over the canvas (not blocked by UI). Remove
		// any prior listener first: setup re-runs on remount, and an anonymous
		// handler would leak one document listener per mount.
		const canvas = document.querySelector('#p5-container canvas');
		if (pointerMoveHandler) document.removeEventListener('pointermove', pointerMoveHandler);
		pointerMoveHandler = (e) => {
			canHover = e.target === canvas;
		};
		document.addEventListener('pointermove', pointerMoveHandler);

		// RIGHT-click on the canvas → open the floating context menu near the
		// cursor (and suppress the browser's native menu). p5 has no built-in
		// right-click hook, so attach a native 'contextmenu' listener to the
		// canvas element. Remove any prior listener first  -  setup re-runs on
		// hot-reload / mode switch and we don't want to stack handlers.
		if (contextMenuHandler && contextMenuCanvasEl) {
			contextMenuCanvasEl.removeEventListener('contextmenu', contextMenuHandler);
		}
		contextMenuCanvasEl = canvas as HTMLCanvasElement | null;
		if (contextMenuCanvasEl) {
			contextMenuHandler = (e: MouseEvent) => {
				e.preventDefault();
				p5.openCanvasContextMenu(e.clientX, e.clientY);
			};
			contextMenuCanvasEl.addEventListener('contextmenu', contextMenuHandler);
		}

		// Theme refresh: when the user flips <html data-theme>, snapshot
		// the new --te-* tokens so the next frame draws with them. The
		// MutationObserver only fires on attribute changes, so cost is
		// trivial. Disconnect any prior observer first  -  hot-reload or
		// mode switching re-runs setup and we don't want to stack them.
		if (themeObserver) themeObserver.disconnect();
		themeObserver = new MutationObserver(() => {
			refreshDrawTheme();
			// p5 is in its default looping mode, so refreshing the cache
			// is enough  -  the next p5.draw() tick will build a DrawContext
			// with the new theme snapshot.
		});
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-theme']
		});

		// svelte-p5 calls p5.remove() when <Sketch> unmounts (e.g. entering
		// Transcribe mode). Wrap it to drop this instance's listeners and clear
		// P5Store - left set, it points at the dead instance and callers like
		// TranscriptEditor invoke methods on it. __cleanupInstalled prevents
		// double-wrapping if setup re-runs on the same instance.
		if (!p5.__cleanupInstalled) {
			p5.__cleanupInstalled = true;
			const originalRemove = p5.remove.bind(p5);
			p5.remove = () => {
				if (pointerMoveHandler) {
					document.removeEventListener('pointermove', pointerMoveHandler);
					pointerMoveHandler = null;
				}
				if (contextMenuHandler && contextMenuCanvasEl) {
					contextMenuCanvasEl.removeEventListener('contextmenu', contextMenuHandler);
					contextMenuHandler = null;
				}
				if (themeObserver) {
					themeObserver.disconnect();
					themeObserver = null;
				}
				// Only clear if it still points at THIS instance; a remounting
				// instance may have already claimed the store.
				P5Store.update((cur) => (cur === p5 ? null : cur));
				originalRemove();
			};
		}

		// If transcript data already exists (e.g., after mode switch), populate it
		if (transcript.wordArray?.length > 0) {
			p5.fillAllData();
		}
	};

	p5.getContainerSize = () => {
		const rect = getP5ContainerRect();
		if (rect) {
			return { width: rect.width, height: rect.height };
		}
		// Fallback to window-based calculation
		const bottomNavHeight = (document.querySelector('.btm-nav') as HTMLElement)?.offsetHeight || 80;
		return { width: window.innerWidth, height: window.innerHeight - bottomNavHeight };
	};

	p5.draw = () => {
		// Paint the canvas background even before data loads so the empty
		// canvas matches the active theme (otherwise dark mode shows a
		// white default until the first viz appears).
		const theme = getDrawTheme();
		p5.background(theme.bg);
		if (p5.arrayIsLoaded(transcript.wordArray) && p5.arrayIsLoaded(users)) {
			p5.renderer.drawViz();
		}
		if (timeline.isAnimating) p5.updateAnimation();
		p5.updateCursor();
	};

	p5.updateCursor = () => {
		if (!videoState.isLoaded || !videoState.isVisible) {
			p5.cursor(p5.ARROW);
			return;
		}

		const { hoveredDataPoint, arrayOfFirstWords } = hoverState;
		const hasPlayableHover = hoveredDataPoint || arrayOfFirstWords?.length > 0;

		p5.cursor(hasPlayableHover ? p5.HAND : p5.ARROW);
	};

	p5.updateAnimation = () => {
		p5.syncAnimationCounter();
		p5.handleTimelineAnimationState();
	};

	p5.syncAnimationCounter = () => {
		const targetIndex = p5.getAnimationTargetIndex();
		const delta = targetIndex - p5.animationCounter;
		if (delta === 0) return;

		const skipAnimationThreshold = 100;
		if (Math.abs(delta) > skipAnimationThreshold) {
			p5.animationCounter = targetIndex;
		} else {
			p5.animationCounter += Math.sign(delta);
		}
		p5.dynamicData.setEndIndex(p5.animationCounter);
	};

	p5.getAnimationTargetIndex = () => {
		const currTime = timeline.currTime;
		const words = transcript.wordArray;
		let low = 0;
		let high = words.length;

		// Binary search: find first index where startTime > currTime
		while (low < high) {
			const mid = (low + high) >>> 1;
			if (words[mid].startTime <= currTime) {
				low = mid + 1;
			} else {
				high = mid;
			}
		}
		return low;
	};

	p5.setAnimationCounter = (targetIndex: number) => {
		p5.animationCounter = targetIndex;
		p5.dynamicData.setEndIndex(targetIndex);
	};

	p5.handleTimelineAnimationState = () => {
		if (timeline.currTime < timeline.rightMarker) {
			p5.continueTimelineAnimation();
		} else {
			p5.endTimelineAnimation();
		}
	};

	p5.continueTimelineAnimation = () => {
		const useVideoTime = videoState.isLoaded && videoState.isPlaying && transcript.timingMode !== 'untimed';
		const timeToSet = useVideoTime ? videoState.currentTime : timeline.currTime + (currConfig.animationRate * Math.min(p5.deltaTime, 100)) / 1000;

		TimelineStore.update((t) => {
			t.currTime = timeToSet;
			return t;
		});
	};

	p5.endTimelineAnimation = () => {
		p5.setAnimationCounter(p5.getAnimationTargetIndex()); // important if user scrubs to end quickly
		TimelineStore.update((timeline) => {
			timeline.isAnimating = false;
			// Reset to left marker when animation completes
			timeline.currTime = timeline.leftMarker;
			return timeline;
		});
		p5.fillSelectedData(); // Update visualization to reflect reset position
	};

	p5.mousePressed = () => {
		// Only LEFT-click drives play/seek. RIGHT-click is handled by the
		// native 'contextmenu' listener (it opens the menu); ignore it here so
		// a right-click doesn't also trigger playback.
		if (p5.mouseButton === p5.RIGHT) return;
		if (mouseEventLocked) return;
		mouseEventLocked = true;
		requestAnimationFrame(() => {
			mouseEventLocked = false;
		});

		// Speaker filter lock is a cheap editor-side selection update; it
		// keeps the editor in sync with visualization hover intent on any
		// left-click in a speaker-centric viz.
		p5.handleSpeakerFilterClick();

		// LEFT-click on the canvas → per-viz play / pause-toggle. Dismiss any
		// open context menu so it doesn't linger over the seeked video frame.
		// (The context menu now opens on RIGHT-click; see the 'contextmenu'
		// listener wired in setup.)
		UIStateStore.update((s) => ({
			...s,
			contextMenu: { ...s.contextMenu, open: false, payload: null }
		}));
		if (!p5.overRect(0, 0, p5.width, p5.height)) return;
		p5.handleVideoClick();
	};

	p5.openCanvasContextMenu = (clientX?: number, clientY?: number) => {
		const payload = p5.buildContextMenuPayload();
		// No real data element under the cursor → don't open a menu over empty
		// canvas space.
		if (!payload) return;

		// Prefer the viewport coordinates from the triggering 'contextmenu'
		// event. Fall back to deriving them from p5's canvas-relative
		// mouseX/mouseY (the ContextMenu is position: fixed).
		let x: number;
		let y: number;
		if (clientX !== undefined && clientY !== undefined) {
			x = clientX;
			y = clientY;
		} else {
			const canvasEl = document.querySelector('#p5-container canvas') as HTMLCanvasElement | null;
			if (!canvasEl) return;
			const rect = canvasEl.getBoundingClientRect();
			x = rect.left + p5.mouseX;
			y = rect.top + p5.mouseY;
		}

		UIStateStore.update((s) => ({
			...s,
			contextMenu: { open: true, x, y, payload }
		}));
	};

	p5.buildContextMenuPayload = (): ContextMenuPayload | null => {
		// The hover state already tracks what's under the cursor each frame.
		// Prefer the richest real data element: a specific word, then a turn
		// (via firstWords  -  a hovered distribution/snippet panel). Return null
		// when the cursor is over empty canvas space so no menu opens.
		const hovered = hoverState.hoveredDataPoint;
		// turnNumber === -1 marks a synthetic turn-chart "seek to time under
		// cursor" point  -  that's a left-click play target, not a real data
		// element, so it doesn't earn a context menu.
		if (hovered && hovered.turnNumber !== -1) {
			return {
				kind: 'word',
				time: hovered.startTime,
				word: hovered.word,
				speakerId: hovered.speaker
			};
		}

		const firstWords = hoverState.arrayOfFirstWords;
		if (firstWords && firstWords.length > 0) {
			const first = firstWords[0];
			return {
				kind: 'turn',
				time: first.startTime,
				turnId: String(first.turnNumber),
				speakerId: first.speaker
			};
		}

		return null;
	};

	// Lock speaker filter in editor when clicking on a speaker-centric visualization
	p5.handleSpeakerFilterClick = () => {
		if (!editorState?.config?.isVisible) return;
		const isSpeakerViz =
			currConfig?.speakerGardenToggle || currConfig?.speakerFingerprintToggle || currConfig?.turnNetworkToggle || currConfig?.dashboardToggle;
		if (!isSpeakerViz) return;

		const hoveredSpeaker = hoverState.hoveredSpeaker;
		if (hoveredSpeaker) {
			EditorStore.update((state) => ({
				...state,
				selection: {
					...state.selection,
					filteredSpeaker: hoveredSpeaker,
					highlightedSpeaker: hoveredSpeaker,
					selectedTurnNumber: null,
					selectionSource: 'visualizationClick'
				}
			}));
		}
	};

	p5.handleVideoClick = () => {
		if (!p5.overRect(0, 0, p5.width, p5.height)) return;
		handleVisualizationClick();
	};

	p5.fillAllData = () => {
		if (!p5.dynamicData) return; // unset before setup() and after teardown
		p5.setAnimationCounter(transcript.wordArray.length);
	};

	p5.fillSelectedData = () => {
		if (!p5.dynamicData) return; // Guard against calls before setup completes
		p5.dynamicData.setEndIndex(p5.animationCounter);
	};

	/**
	 * Determines whether to draw an item in the dashboard view based on cross-highlight state.
	 * Returns false to dim items that don't match the highlighted turn/speaker.
	 */
	p5.shouldDraw = (item: any) => {
		const turns = hoverState.dashboardHighlightAllTurns;
		if (turns) return turns.includes(item.turnNumber);
		const turn = hoverState.dashboardHighlightTurn;
		const speaker = hoverState.dashboardHighlightSpeaker;
		const matchesTurn = turn != null ? item.turnNumber === turn : true;
		const matchesSpeaker = speaker ? item.speaker === speaker : true;
		return matchesTurn && matchesSpeaker;
	};

	p5.overRect = (x: number, y: number, boxWidth: number, boxHeight: number) => {
		return canHover && hitTest.rect(p5.mouseX, p5.mouseY, x, y, boxWidth, boxHeight);
	};

	p5.windowResized = () => {
		if (!p5.dynamicData) return; // Guard against calls before setup completes
		const { width, height } = p5.getContainerSize();
		p5.resizeCanvas(width, height);
		p5.fillSelectedData();
	};

	p5.overCircle = (x: number, y: number, diameter: number) => {
		return canHover && hitTest.circle(p5.mouseX, p5.mouseY, x, y, diameter);
	};

	p5.arrayIsLoaded = (data: any) => {
		return Array.isArray(data) && data.length;
	};
};
