const DIM_ALPHA = 0.2;

/**
 * Runs a draw callback with optional alpha dimming, guaranteeing reset via try/finally.
 */
export function withDimming(ctx: CanvasRenderingContext2D, dim: boolean, fn: () => void): void {
	if (dim) ctx.globalAlpha = DIM_ALPHA;
	try {
		fn();
	} finally {
		if (dim) ctx.globalAlpha = 1.0;
	}
}

const TOOLTIP_MAX_TURNS = 4;
const TOOLTIP_PREVIEW_WORDS = 8;
const TURN_SEPARATOR = '<span style="opacity: 0.2">———</span>';

export interface TurnPreview {
	wordCount: number;
	content: string;
}

/**
 * Formats an array of turns into tooltip HTML with truncation and separators.
 * Returns the turn lines section only (no header).
 */
export function formatTurnPreviewLines(turns: TurnPreview[]): string {
	const multiTurn = turns.length > 1;
	const turnLines = turns.slice(0, TOOLTIP_MAX_TURNS).map((t) => {
		let text = t.content;
		if (multiTurn) {
			const words = t.content.split(' ');
			if (words.length > TOOLTIP_PREVIEW_WORDS) {
				text = words.slice(0, TOOLTIP_PREVIEW_WORDS).join(' ') + `... (${words.length - TOOLTIP_PREVIEW_WORDS} more words)`;
			}
		}
		return `<span style="font-size: 0.85em; opacity: 0.6">${t.wordCount} words</span>\n${text}`;
	});
	const remaining = turns.length - TOOLTIP_MAX_TURNS;
	if (remaining > 0) {
		turnLines.push(`<span style="font-size: 0.85em; opacity: 0.5">...and ${remaining} more turn${remaining !== 1 ? 's' : ''}</span>`);
	}
	return turnLines.join('\n' + TURN_SEPARATOR + '\n');
}
