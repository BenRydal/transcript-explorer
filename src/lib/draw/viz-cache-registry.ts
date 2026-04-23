/**
 * Viz cache registry.
 *
 * A tiny pub-sub used to zero out every module-scope / GPU-resident cache
 * owned by the draw layer when a new transcript is loaded. Each cache
 * owner calls `registerVizCacheReset(fn)` at module load time; the
 * transcript-lifecycle hook calls `resetVizCaches()` on load/discard.
 *
 * Rationale: without this, module-level caches (Map<word, width>, the
 * p5.Graphics contribution-cloud buffer, and per-class "full transcript
 * max" memos) retain pointers to the previous transcript's data after a
 * new example loads. The scaling cache's key does include the new
 * wordArray length, so it invalidates naturally — but the wordWidth map
 * and the `p5.Graphics` buffer do NOT, and the buffer sits on the GPU.
 *
 * Keep this module dependency-free (no svelte stores, no p5 types) so
 * any cache owner can import it without cycles.
 */

type Reset = () => void;

const resets: Reset[] = [];

/** Register a callback to be invoked when transcript data changes. */
export function registerVizCacheReset(fn: Reset): void {
	resets.push(fn);
}

/** Invoke every registered cache reset. Called from transcript-lifecycle. */
export function resetVizCaches(): void {
	for (const fn of resets) {
		try {
			fn();
		} catch (e) {
			// A single cache owner throwing shouldn't wedge the rest; this is
			// a cleanup path, not a critical path.
			console.error('[viz-cache-registry] reset failed:', e);
		}
	}
}
