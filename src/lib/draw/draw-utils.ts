import type p5 from 'p5';
import type { User } from '../../models/user';
import type { HoverState } from '../../stores/hoverStore';
import type { Bounds } from './types/bounds';
import { formatTimeCompact } from '../core/time-utils';

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

/**
 * Creates a Map from speaker name to User object for quick lookups.
 */
export function createUserMap(users: User[]): Map<string, User> {
	return new Map(users.map((u) => [u.name, u]));
}

/**
 * Cross-highlight state for dashboard mode.
 * Computed once per draw call, used to dim non-matching elements.
 */
export interface CrossHighlight {
	/** Whether cross-highlighting is active (dashboard mode with hover, mouse outside panel) */
	active: boolean;
	/** Speaker being highlighted (null if none) */
	speaker: string | null;
	/** Specific turn being highlighted (null if none) */
	turn: number | null;
	/** Multiple turns being highlighted, e.g., from turn network edge (null if none) */
	turns: number[] | null;
}

const NO_HIGHLIGHT: CrossHighlight = { active: false, speaker: null, turn: null, turns: null };

/**
 * Computes cross-highlight state for dashboard mode.
 * Returns inactive state if not in dashboard mode or mouse is inside the panel.
 */
export function getCrossHighlight(sk: p5, bounds: Bounds, dashboardToggle: boolean, hover: HoverState): CrossHighlight {
	if (!dashboardToggle) return NO_HIGHLIGHT;

	const hl = hover.dashboardHighlightSpeaker;
	const hlTurn = hover.dashboardHighlightTurn;
	const hlTurns = hover.dashboardHighlightAllTurns;

	if (hl == null && hlTurn == null && hlTurns == null) return NO_HIGHLIGHT;

	const mouseInPanel = sk.overRect(bounds.x, bounds.y, bounds.width, bounds.height);
	if (mouseInPanel) return NO_HIGHLIGHT;

	return {
		active: true,
		speaker: hl,
		turn: hlTurn,
		turns: hlTurns
	};
}

/**
 * Draws a horizontal time axis with tick marks and labels below the grid area.
 */
export function drawTimeAxis(
	sk: p5,
	bounds: Bounds,
	grid: { gx: number; gy: number; gw: number; gh: number },
	timeline: { leftMarker: number; rightMarker: number }
): void {
	const fontSize = Math.max(8, Math.min(10, bounds.height * 0.025));
	sk.textSize(fontSize);
	sk.fill(120);
	sk.noStroke();
	sk.textAlign(sk.CENTER, sk.TOP);

	const duration = timeline.rightMarker - timeline.leftMarker;
	const numTicks = Math.min(8, Math.floor(grid.gw / 60));

	for (let i = 0; i <= numTicks; i++) {
		const frac = i / numTicks;
		const time = timeline.leftMarker + frac * duration;
		const x = grid.gx + frac * grid.gw;

		// Tick mark
		sk.stroke(200);
		sk.strokeWeight(1);
		sk.line(x, grid.gy + grid.gh, x, grid.gy + grid.gh + 5);

		// Time label
		sk.noStroke();
		sk.fill(120);
		sk.text(formatTimeCompact(time), x, grid.gy + grid.gh + 8);
	}
}

const PLAYHEAD_COLOR = '#ef4444';
const PLAYHEAD_WEIGHT = 1.5;

/**
 * Draws a vertical playhead line at the given time position within a region.
 */
export function drawPlayhead(sk: p5, currTime: number, leftMarker: number, rightMarker: number, region: Bounds): void {
	if (currTime <= leftMarker || currTime > rightMarker) return;
	const range = rightMarker - leftMarker;
	if (range <= 0) return;
	const x = region.x + ((currTime - leftMarker) / range) * region.width;
	sk.push();
	sk.stroke(PLAYHEAD_COLOR);
	sk.strokeWeight(PLAYHEAD_WEIGHT);
	sk.line(x, region.y, x, region.y + region.height);
	sk.pop();
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
