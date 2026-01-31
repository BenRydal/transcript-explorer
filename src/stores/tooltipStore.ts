import { writable } from 'svelte/store';

export interface TooltipData {
	visible: boolean;
	x: number;
	y: number;
	content: string;
	speakerColor: string;
	position: 'above' | 'below'; // Whether tooltip should appear above or below the mouse
}

const initialState: TooltipData = {
	visible: false,
	x: 0,
	y: 0,
	content: '',
	speakerColor: '#000000',
	position: 'above'
};

const TooltipStore = writable<TooltipData>(initialState);

// Track if any visualization requested a tooltip this frame
let tooltipRequestedThisFrame = false;

export function showTooltip(x: number, y: number, content: string, speakerColor: string, canvasHeight: number) {
	// Position tooltip above if mouse is in lower 3/4 of canvas, below if in upper 1/4
	const position = y < canvasHeight / 4 ? 'below' : 'above';

	tooltipRequestedThisFrame = true;
	TooltipStore.set({
		visible: true,
		x,
		y,
		content,
		speakerColor,
		position
	});
}

// Call this at the start of each draw frame to reset the flag
export function resetTooltipFrame() {
	tooltipRequestedThisFrame = false;
}

// Call this at the end of each draw frame to hide tooltip if nothing requested it
export function finalizeTooltipFrame() {
	if (!tooltipRequestedThisFrame) {
		TooltipStore.update((state) => ({
			...state,
			visible: false
		}));
	}
}

export default TooltipStore;
