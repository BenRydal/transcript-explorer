import { writable } from 'svelte/store';
import type { DataPoint } from '../models/dataPoint';
import type { Bounds } from '../lib/draw/types/bounds';

/**
 * Ephemeral frame-by-frame hover state for p5 visualizations.
 * This state is updated every frame and should not be mixed with persistent user preferences.
 */
export interface HoverState {
	/** Currently hovered data point (word) */
	hoveredDataPoint: DataPoint | null;
	/** Speaker being hovered in any visualization */
	hoveredSpeaker: string | null;
	/** First words of turns for snippet playback (e.g., all turns for a speaker) */
	arrayOfFirstWords: DataPoint[];
	/** Bounds of panels with overflow (for showing overflow indicators) */
	overflowBounds: Bounds[];
	/** Dashboard cross-highlight: speaker to highlight across all panels */
	dashboardHighlightSpeaker: string | null;
	/** Dashboard cross-highlight: specific turn number to highlight */
	dashboardHighlightTurn: number | null;
	/** Dashboard cross-highlight: multiple turn numbers to highlight (e.g., turn network edge) */
	dashboardHighlightAllTurns: number[] | null;
}

export const initialHoverState: HoverState = {
	hoveredDataPoint: null,
	hoveredSpeaker: null,
	arrayOfFirstWords: [],
	overflowBounds: [],
	dashboardHighlightSpeaker: null,
	dashboardHighlightTurn: null,
	dashboardHighlightAllTurns: null
};

const HoverStore = writable<HoverState>(initialHoverState);

export default HoverStore;
