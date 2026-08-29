/**
 * The dashboard splits the canvas by subtracting padding and gaps before
 * halving, so a short canvas drove a panel's height negative. That size
 * reached `createGraphics` in the contribution cloud, and the throw escaped
 * the frame -- p5 requests its next animation frame only after `redraw()`
 * returns, so a single bad frame ended the loop for the rest of the session.
 * The canvas then froze on its last good frame and only `resizeCanvas`, which
 * redraws once, brought it back.
 *
 * `Sketch.svelte` clamps the canvas to 1x1, so that is the floor these have to
 * survive.
 */

import { describe, expect, it } from 'vitest';
import { dashboardLayout, MIN_PANEL_SIZE } from '../src/lib/draw/dashboard-layout';

const PANEL_COUNTS = [2, 3, 4];

/** Canvas sizes seen while the shell animates, mounts, or is collapsed. */
const DEGENERATE = [
	[1, 1],
	[50, 0],
	[100, 10],
	[200, 20],
	[300, 37],
	[0, 0],
	[1400, 1]
];

describe('dashboardLayout', () => {
	for (const count of PANEL_COUNTS) {
		it(`${count} panels: never returns a negative or zero size, even at 1x1`, () => {
			for (const [w, h] of DEGENERATE) {
				for (const b of dashboardLayout(w, h, count)) {
					expect(b.width, `width at ${w}x${h}`).toBeGreaterThanOrEqual(MIN_PANEL_SIZE);
					expect(b.height, `height at ${w}x${h}`).toBeGreaterThanOrEqual(MIN_PANEL_SIZE);
				}
			}
		});

		it(`${count} panels: returns one rect per panel`, () => {
			expect(dashboardLayout(1400, 700, count)).toHaveLength(count);
		});

		it(`${count} panels: stays inside the canvas at a normal size`, () => {
			for (const b of dashboardLayout(1400, 700, count)) {
				expect(b.x).toBeGreaterThanOrEqual(0);
				expect(b.y).toBeGreaterThanOrEqual(0);
				expect(b.x + b.width).toBeLessThanOrEqual(1400);
				expect(b.y + b.height).toBeLessThanOrEqual(700);
			}
		});
	}

	it('lays three panels out as a full-width band over two halves', () => {
		const [top, left, right] = dashboardLayout(1400, 700, 3);
		expect(top.width).toBeGreaterThan(left.width);
		expect(left.y).toBeGreaterThan(top.y);
		expect(right.y).toBe(left.y);
		expect(right.x).toBeGreaterThan(left.x);
	});

	it('lays two panels side by side at full height', () => {
		const [a, b] = dashboardLayout(1400, 700, 2);
		expect(a.y).toBe(b.y);
		expect(a.height).toBe(b.height);
		expect(b.x).toBeGreaterThan(a.x);
	});

	it('lays four panels out as a grid', () => {
		const [tl, tr, bl, br] = dashboardLayout(1400, 700, 4);
		expect(tr.y).toBe(tl.y);
		expect(bl.y).toBeGreaterThan(tl.y);
		expect(br.x).toBe(tr.x);
		expect(br.y).toBe(bl.y);
	});

	it('is not fooled by a negative canvas', () => {
		for (const b of dashboardLayout(-100, -100, 3)) {
			expect(b.width).toBeGreaterThanOrEqual(MIN_PANEL_SIZE);
			expect(b.height).toBeGreaterThanOrEqual(MIN_PANEL_SIZE);
		}
	});
});
