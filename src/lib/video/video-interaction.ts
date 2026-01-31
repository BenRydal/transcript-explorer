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
 * 2. Turn chart hover → play from that turn
 * 3. Contribution cloud hover → play from that word
 * 4. Distribution diagram hover → play speaker snippets
 */
export function handleVisualizationClick(): void {
	const videoState = get(VideoStore);

	if (!videoState.isLoaded || !videoState.isVisible) return;

	if (videoState.isPlaying) {
		stopPlayback();
		return;
	}

	const config = get(ConfigStore);

	// Check each visualization's hovered DataPoint in priority order
	const hoveredDataPoint =
		config.firstWordOfTurnSelectedInTurnChart ||
		config.selectedWordFromContributionCloud ||
		config.selectedWordFromWordRain ||
		config.selectedElementFromTurnNetwork ||
		config.selectedCellFromHeatmap ||
		config.hoveredBarFromTurnLength;

	if (hoveredDataPoint) {
		playFrom(hoveredDataPoint);
	} else if (config.hoveredPetalData) {
		playFrom(config.hoveredPetalData.firstDataPoint);
	} else if (config.arrayOfFirstWords?.length) {
		playSnippets(config.arrayOfFirstWords);
	}
}
