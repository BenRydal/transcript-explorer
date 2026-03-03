import type { TimelineStore } from 'svelte-interactive-timeline';

export interface PlaybackControllerOptions {
	speeds?: { value: number; label: string }[];
	onFrame?: (currentTime: number) => void;
	endBehavior?: 'stop' | 'reset';
}

export function createPlaybackController(
	store: TimelineStore,
	options?: PlaybackControllerOptions
) {
	const speeds = options?.speeds ?? [
		{ value: 1, label: '1x' },
		{ value: 3, label: '3x' },
		{ value: 6, label: '6x' },
		{ value: 15, label: '15x' },
		{ value: 30, label: '30x' }
	];
	const endBehavior = options?.endBehavior ?? 'stop';

	let isPlaying = $state(false);
	let speedIndex = $state(0);
	let animationId: number | null = null;
	let lastFrameTime = 0;

	function play() {
		if (isPlaying) return;
		isPlaying = true;
		lastFrameTime = performance.now();
		tick();
	}

	function pause() {
		isPlaying = false;
		if (animationId !== null) {
			cancelAnimationFrame(animationId);
			animationId = null;
		}
	}

	function togglePlayPause() {
		if (isPlaying) pause();
		else play();
	}

	function cycleSpeed() {
		speedIndex = (speedIndex + 1) % speeds.length;
	}

	function reset() {
		pause();
		store.setCurrentTime(store.viewStart);
	}

	function tick() {
		if (!isPlaying) return;

		const now = performance.now();
		const delta = (now - lastFrameTime) / 1000; // seconds
		lastFrameTime = now;

		const speed = speeds[speedIndex].value;
		const newTime = store.currentTime + delta * speed;

		if (newTime >= store.viewEnd) {
			store.setCurrentTime(store.viewEnd);
			if (endBehavior === 'reset') {
				store.setCurrentTime(store.viewStart);
			}
			pause();
			return;
		}

		store.setCurrentTime(newTime);
		options?.onFrame?.(store.currentTime);

		animationId = requestAnimationFrame(tick);
	}

	function setSpeedByValue(value: number) {
		const idx = speeds.findIndex((s) => s.value === value);
		if (idx >= 0) speedIndex = idx;
	}

	function destroy() {
		pause();
	}

	return {
		get isPlaying() {
			return isPlaying;
		},
		get speed() {
			return speeds[speedIndex].value;
		},
		get speedLabel() {
			return speeds[speedIndex].label;
		},
		play,
		pause,
		togglePlayPause,
		cycleSpeed,
		reset,
		setSpeedByValue,
		destroy
	};
}

export type PlaybackController = ReturnType<typeof createPlaybackController>;
