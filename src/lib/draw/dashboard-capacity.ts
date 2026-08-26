// Word-oriented views cost by transcript, not by panel, so several at once
// stalls the frame. Chosen from where the bundled corpus separates.
export const MAX_DASHBOARD_WORDS = 50_000;

/** True when the dashboard can be drawn without stalling the frame. */
export function canRenderDashboard(wordCount: number): boolean {
	return wordCount <= MAX_DASHBOARD_WORDS;
}

/** Why the dashboard is unavailable; null when it is available. */
export function dashboardUnavailableReason(wordCount: number): string | null {
	if (canRenderDashboard(wordCount)) return null;
	return `This transcript has ${wordCount.toLocaleString()} words. The dashboard draws several views at once and cannot keep up past ${MAX_DASHBOARD_WORDS.toLocaleString()}; open one visualization at a time instead.`;
}
