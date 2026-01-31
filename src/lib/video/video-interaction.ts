/**
 * Video Interaction Service
 * Handles what to play based on visualization state.
 */

import { get } from 'svelte/store';
import VideoStore, { stopPlayback, playFrom, playSnippets } from '../../stores/videoStore';
import ConfigStore from '../../stores/configStore';

/**
 * Handle a click on the visualization canvas.
 * Determines what to play based on what's currently hovered.
 *
 * Priority:
 * 1. If playing, stop playback
 * 2. Hovered data point → play from that point
 * 3. Distribution diagram hover → play speaker snippets
 */
export function handleVisualizationClick(): void {
	const videoState = get(VideoStore);

	if (!videoState.isLoaded || !videoState.isVisible) return;

	if (videoState.isPlaying) {
		stopPlayback();
		return;
	}

	const config = get(ConfigStore);
	const { hoveredDataPoint, arrayOfFirstWords } = config;

	if (hoveredDataPoint) {
		playFrom(hoveredDataPoint);
	} else if (arrayOfFirstWords?.length) {
		playSnippets(arrayOfFirstWords);
	}
}
