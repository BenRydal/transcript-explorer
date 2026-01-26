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
	const { firstWordOfTurnSelectedInTurnChart, selectedWordFromContributionCloud, arrayOfFirstWords } = config;

	if (firstWordOfTurnSelectedInTurnChart) {
		playFrom(firstWordOfTurnSelectedInTurnChart);
	} else if (selectedWordFromContributionCloud) {
		playFrom(selectedWordFromContributionCloud);
	} else if (arrayOfFirstWords?.length) {
		playSnippets(arrayOfFirstWords);
	}
}
