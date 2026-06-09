import { get } from 'svelte/store';
import UserStore from '../../stores/userStore';
import TranscriptStore from '../../stores/transcriptStore';
import TimelineStore from '../../stores/timelineStore';
import EditorStore from '../../stores/editorStore';
import P5Store from '../../stores/p5Store';
import { clearState } from './persistence';
import { getMaxTime, applyTimingModeToWordArray } from './timing-utils';
import { resetVizCaches } from '../draw/viz-cache-registry';
import type { TranscriptCreationResult } from './transcript-factory';

/**
 * Resize the p5 canvas to fit its container, if the container has non-zero size.
 * Reads the p5 instance from P5Store.
 */
export function triggerCanvasResize() {
	const p5Instance = get(P5Store);
	if (!p5Instance) return;
	const container = document.getElementById('p5-container');
	if (container) {
		const rect = container.getBoundingClientRect();
		if (rect.width > 0 && rect.height > 0) {
			p5Instance.windowResized?.();
		}
	}
}

/**
 * Apply a newly created transcript to all stores.
 * Handles timing mode application, timeline reset, and canvas refresh.
 * @param timelineEndOverride - Use when timeline should extend beyond transcript data (e.g., video duration)
 */
export function applyTranscriptResult({ transcript, users }: TranscriptCreationResult, timelineEndOverride?: number) {
	transcript.wordArray = applyTimingModeToWordArray(transcript.wordArray, transcript.timingMode);
	const maxTime = getMaxTime(transcript.wordArray);
	transcript.totalTimeInSeconds = maxTime;

	// Free draw-layer caches (GPU buffer + memos keyed on the old wordArray)
	// before the store writes so the next frame starts clean.
	resetVizCaches();

	UserStore.set(users);
	TranscriptStore.set(transcript);

	const timelineEnd = timelineEndOverride ?? maxTime;
	TimelineStore.update((timeline) => ({
		...timeline,
		currTime: 0,
		startTime: 0,
		endTime: timelineEnd,
		leftMarker: 0,
		rightMarker: timelineEnd,
		isAnimating: false
	}));

	requestAnimationFrame(() => {
		triggerCanvasResize();
		const p5Instance = get(P5Store);
		p5Instance?.fillAllData?.();
	});
}

export function openEditor() {
	EditorStore.update((state) => ({
		...state,
		config: { ...state.config, isVisible: true }
	}));
}

export function handleDiscard() {
	clearState();
	resetVizCaches();
}
