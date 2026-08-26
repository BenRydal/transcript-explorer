/**
 * The contribution cloud renders into an offscreen p5.Graphics buffer, and a
 * buffer does not inherit the main sketch's font. It set one with
 * `buffer.textFont(sk.font)` -- but `sk.font` is not a property this sketch
 * ever assigned, so p5 received undefined and threw "null font passed to
 * textFont".
 *
 * That is fatal rather than cosmetic: p5 requests its next animation frame
 * only after `redraw()` returns, so the throw ended the loop for the session.
 * The contribution cloud is one of the three default dashboard panels, so
 * opening the dashboard froze the canvas every time.
 *
 * The stub below rejects a null or undefined font exactly as p5 does.
 */

import { describe, expect, it } from 'vitest';
import { CANVAS_FONT_FAMILY } from '../src/lib/constants/ui';

/** Mirrors p5's own guard in `textFont`. */
function p5TextFont(font: unknown): void {
	if (font === null || font === undefined) throw new Error('null font passed to textFont');
}

describe('canvas font', () => {
	it('is a resolvable family name, not a loaded font object', () => {
		expect(typeof CANVAS_FONT_FAMILY).toBe('string');
		expect(CANVAS_FONT_FAMILY.length).toBeGreaterThan(0);
	});

	it('satisfies p5 textFont, where the old sk.font did not', () => {
		expect(() => p5TextFont(CANVAS_FONT_FAMILY)).not.toThrow();

		// What the buffer used to be handed: a property nothing assigns.
		const sketchWithoutFontProperty: Record<string, unknown> = {};
		expect(() => p5TextFont(sketchWithoutFontProperty.font)).toThrow(/null font/);
	});

	it('is the family app.css registers, so the buffer matches the main canvas', () => {
		// Guards against the constant drifting from the @font-face declaration.
		expect(CANVAS_FONT_FAMILY).toBe('Plus Jakarta Sans');
	});
});

describe('the buffer sets its own font', () => {
	it('contribution-cloud no longer reads a font off the sketch', async () => {
		const source = await import('node:fs').then((fs) => fs.readFileSync('src/lib/draw/contribution-cloud.ts', 'utf8'));
		const code = source
			.split('\n')
			.filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
			.join('\n');
		expect(code).not.toMatch(/textFont\(\s*sk\.font\s*\)/);
		expect(code).toMatch(/textFont\(CANVAS_FONT_FAMILY\)/);
	});
});
