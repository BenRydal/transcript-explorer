/**
 * Whether a transcript is small enough for the dashboard to be worth drawing.
 *
 * The dashboard renders several views at once into panels a fraction of the
 * canvas. Word-oriented views scale with the transcript rather than the panel,
 * so their cost lands in full on each panel: the contribution cloud lays out
 * and draws a word at a time, and at agentic scale that is enough work per
 * render to block the main thread.
 *
 * The bundled corpus separates cleanly. Human transcripts reach 18,536 words
 * and the largest single-agent session 36,156, while multi-agent sessions run
 * from 106,558 to 503,773. The ceiling sits in that gap, so every transcript
 * the dashboard can actually draw stays available.
 */
export const MAX_DASHBOARD_WORDS = 50_000;

/** True when the dashboard can be drawn without stalling the frame. */
export function canRenderDashboard(wordCount: number): boolean {
	return wordCount <= MAX_DASHBOARD_WORDS;
}

/**
 * Why the dashboard is unavailable, phrased for a tooltip or an empty canvas.
 * Returns null when it is available.
 */
export function dashboardUnavailableReason(wordCount: number): string | null {
	if (canRenderDashboard(wordCount)) return null;
	return `This transcript has ${wordCount.toLocaleString()} words. The dashboard draws several views at once and cannot keep up past ${MAX_DASHBOARD_WORDS.toLocaleString()}; open one visualization at a time instead.`;
}
