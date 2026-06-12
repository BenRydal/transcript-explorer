import { get } from 'svelte/store';
import TimelineStore from '../../stores/timelineStore';
import AppSettingsStore from '../../stores/appSettingsStore';
import P5Store from '../../stores/p5Store';

// TimelineStore is absolute [startTime, endTime]; the scrubber is 0-relative.
// The +/- startTime shift is a no-op while startTime is always 0, kept for safety.
let selectionFillDebounce: ReturnType<typeof setTimeout> | null = null;

export function handleScrubberSeek(scrubTime: number) {
	const startTime = get(TimelineStore).startTime;
	TimelineStore.update((t) => ({ ...t, currTime: scrubTime + startTime }));
	const p5Instance = get(P5Store);
	if (!get(TimelineStore).isAnimating) p5Instance?.fillSelectedData?.();
}

export function handleScrubberPlayToggle(nowPlaying: boolean) {
	const wasPlaying = get(TimelineStore).isAnimating;
	// On play start, snap the playhead to the left selection handle so
	// playback always animates from the start of the current selection
	// (playback always animates from the start of the current selection).
	if (nowPlaying && !wasPlaying) {
		TimelineStore.update((t) => ({ ...t, isAnimating: nowPlaying, currTime: t.leftMarker }));
	} else {
		TimelineStore.update((t) => ({ ...t, isAnimating: nowPlaying }));
	}
	const p5Instance = get(P5Store);
	if (p5Instance) {
		if (nowPlaying && !wasPlaying) {
			const targetIndex = (p5Instance as unknown as { getAnimationTargetIndex?: () => number }).getAnimationTargetIndex?.();
			if (typeof targetIndex === 'number') {
				(p5Instance as unknown as { setAnimationCounter?: (i: number) => void }).setAnimationCounter?.(targetIndex);
			}
		} else if (!nowPlaying && wasPlaying) {
			p5Instance.fillAllData?.();
		}
	}
}

export function handleScrubberSpeedChange(speed: number) {
	AppSettingsStore.update((c) => ({ ...c, animationRate: speed }));
}

export function handleSelectionChange(sel: { start: number; end: number }) {
	const startTime = get(TimelineStore).startTime;
	TimelineStore.update((t) => {
		const nextLeft = sel.start + startTime;
		const nextRight = sel.end + startTime;
		const leftMoved = Math.abs(t.leftMarker - nextLeft) > 1e-6;
		t.leftMarker = nextLeft;
		t.rightMarker = nextRight;
		if (leftMoved) t.currTime = nextLeft;
		else if (t.currTime < nextLeft) t.currTime = nextLeft;
		else if (t.currTime > nextRight) t.currTime = nextRight;
		return t;
	});

	if (!get(TimelineStore).isAnimating) {
		if (selectionFillDebounce) clearTimeout(selectionFillDebounce);
		selectionFillDebounce = setTimeout(() => {
			const p5Instance = get(P5Store);
			p5Instance?.fillSelectedData?.();
		}, 100);
	}
}

export function handleSelectionCommit() {
	if (selectionFillDebounce) {
		clearTimeout(selectionFillDebounce);
		selectionFillDebounce = null;
	}
	if (!get(TimelineStore).isAnimating) {
		const p5Instance = get(P5Store);
		p5Instance?.fillSelectedData?.();
	}
}
