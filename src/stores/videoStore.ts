import { writable, get } from 'svelte/store';
import type { DataPoint } from '../models/dataPoint';
import ConfigStore from './configStore';

export interface VideoSource {
	type: 'youtube' | 'file' | null;
	videoId?: string;
	fileUrl?: string;
}

// Snippets mode state (null = continuous/idle)
export interface SnippetsMode {
	turns: DataPoint[];
	currentIndex: number;
	durationPerSnippet: number;
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
	snippetsMode: SnippetsMode | null; // null = continuous/idle

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
	snippetsMode: null,
	isVisible: false,
	position: { x: 20, y: 20 },
	size: { width: 480, height: 270 },
	aspectRatio: 16 / 9,
	isDragging: false,
	isResizing: false,
	seekRequest: null
};

const VideoStore = writable<VideoState>(initialState);

// Seek request ID for deduplication
let seekRequestId = 0;

// Track which snippet we last advanced from (guards against race conditions)
let lastAdvancedFromIndex = -1;

function advanceSnippet(): void {
	const state = get(VideoStore);
	if (!state.snippetsMode) return;

	const { turns, currentIndex } = state.snippetsMode;
	const nextIndex = currentIndex + 1;

	if (nextIndex >= turns.length) {
		// Finished all snippets
		stopPlayback();
	} else {
		// Advance to next snippet
		const nextTurn = turns[nextIndex];
		seekRequestId++;
		VideoStore.update((s) => ({
			...s,
			snippetsMode: { ...s.snippetsMode!, currentIndex: nextIndex },
			seekRequest: { time: nextTurn.startTime, id: seekRequestId }
		}));
	}
}

function checkSnippetAdvancement(currentTime: number): void {
	const state = get(VideoStore);
	if (!state.isPlaying || !state.snippetsMode) return;

	const { turns, currentIndex, durationPerSnippet } = state.snippetsMode;
	if (currentIndex <= lastAdvancedFromIndex) return;

	const currentTurn = turns[currentIndex];
	const snippetEnd = currentTurn.startTime + durationPerSnippet;

	if (currentTime >= snippetEnd) {
		lastAdvancedFromIndex = currentIndex;
		advanceSnippet();
	}
}

// Action functions
export function loadVideo(source: VideoSource): void {
	stopPlayback();
	VideoStore.update((state) => ({
		...state,
		source,
		isLoaded: false,
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
	stopPlayback();
	VideoStore.update((state) => ({
		...state,
		isVisible: false
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

function play(): void {
	VideoStore.update((s) => ({
		...s,
		isPlaying: true
	}));
}

export function togglePlayPause(): void {
	const state = get(VideoStore);
	if (state.isPlaying) {
		stopPlayback();
	} else {
		play();
	}
}

export function playFrom(dataPoint: DataPoint): void {
	seekRequestId++;
	VideoStore.update((state) => ({
		...state,
		isPlaying: true,
		snippetsMode: null,
		seekRequest: { time: dataPoint.startTime, id: seekRequestId }
	}));
}

export function playSnippets(turns: DataPoint[]): void {
	if (turns.length === 0) return;
	lastAdvancedFromIndex = -1;

	const firstTurn = turns[0];
	const durationPerSnippet = get(ConfigStore).snippetDurationSeconds;
	seekRequestId++;

	VideoStore.update((state) => ({
		...state,
		isPlaying: true,
		snippetsMode: { turns, currentIndex: 0, durationPerSnippet },
		seekRequest: { time: firstTurn.startTime, id: seekRequestId }
	}));
}

export function stopPlayback(): void {
	lastAdvancedFromIndex = -1;
	VideoStore.update((state) => ({
		...state,
		isPlaying: false,
		snippetsMode: null
	}));
}

export function setCurrentTime(time: number): void {
	VideoStore.update((state) => ({
		...state,
		currentTime: time
	}));
	checkSnippetAdvancement(time);
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
