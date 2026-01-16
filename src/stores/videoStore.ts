import { writable, get } from 'svelte/store';

export interface VideoSource {
	type: 'youtube' | 'file' | null;
	videoId?: string;
	fileUrl?: string;
}

export interface VideoState {
	// Source
	source: VideoSource;

	// Playback state
	isLoaded: boolean;
	isPlaying: boolean;
	currentTime: number;
	duration: number;
	isMuted: boolean;

	// UI state
	isVisible: boolean;
	position: { x: number; y: number };
	size: { width: number; height: number };
	aspectRatio: number;

	// Interaction state
	isDragging: boolean;
	isResizing: boolean;

	// Command state (for p5 to request seek)
	seekRequest: { time: number; id: number } | null;
}

const initialState: VideoState = {
	source: { type: null },
	isLoaded: false,
	isPlaying: false,
	currentTime: 0,
	duration: 0,
	isMuted: false,
	isVisible: false,
	position: { x: 20, y: 20 },
	size: { width: 480, height: 270 },
	aspectRatio: 16 / 9,
	isDragging: false,
	isResizing: false,
	seekRequest: null
};

const VideoStore = writable<VideoState>(initialState);

// Action functions
export function loadVideo(source: VideoSource): void {
	VideoStore.update((state) => ({
		...state,
		source,
		isLoaded: false,
		isPlaying: false,
		currentTime: 0,
		duration: 0,
		isVisible: false // Don't auto-show, user must click button
	}));
}

export function setLoaded(duration: number): void {
	VideoStore.update((state) => ({
		...state,
		isLoaded: true,
		duration
	}));
}

export function showVideo(): void {
	VideoStore.update((state) => ({
		...state,
		isVisible: true
	}));
}

export function hideVideo(): void {
	VideoStore.update((state) => ({
		...state,
		isVisible: false,
		isPlaying: false
	}));
}

export function toggleVisibility(): void {
	const state = get(VideoStore);
	if (!state.isLoaded) return;
	if (state.isVisible) {
		hideVideo();
	} else {
		showVideo();
	}
}

export function play(): void {
	VideoStore.update((state) => ({
		...state,
		isPlaying: true
	}));
}

export function pause(): void {
	VideoStore.update((state) => ({
		...state,
		isPlaying: false
	}));
}

export function togglePlayPause(): void {
	const state = get(VideoStore);
	if (state.isPlaying) {
		pause();
	} else {
		play();
	}
}

export function setCurrentTime(time: number): void {
	VideoStore.update((state) => ({
		...state,
		currentTime: time
	}));
}

let seekRequestId = 0;
export function requestSeek(time: number): void {
	seekRequestId++;
	VideoStore.update((state) => ({
		...state,
		seekRequest: { time, id: seekRequestId }
	}));
}

export function clearSeekRequest(): void {
	VideoStore.update((state) => ({
		...state,
		seekRequest: null
	}));
}

export function setMuted(muted: boolean): void {
	VideoStore.update((state) => ({
		...state,
		isMuted: muted
	}));
}

export function toggleMute(): void {
	const state = get(VideoStore);
	setMuted(!state.isMuted);
}

export function updatePosition(x: number, y: number): void {
	VideoStore.update((state) => ({
		...state,
		position: { x, y }
	}));
}

export function updateSize(width: number, height: number): void {
	VideoStore.update((state) => ({
		...state,
		size: { width, height }
	}));
}

export function setDragging(isDragging: boolean): void {
	VideoStore.update((state) => ({
		...state,
		isDragging
	}));
}

export function setResizing(isResizing: boolean): void {
	VideoStore.update((state) => ({
		...state,
		isResizing
	}));
}

export function setAspectRatio(ratio: number): void {
	VideoStore.update((state) => ({
		...state,
		aspectRatio: ratio
	}));
}

export function reset(): void {
	VideoStore.set(initialState);
}

export default VideoStore;
