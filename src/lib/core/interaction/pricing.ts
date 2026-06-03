import type { Usage } from '../../../models/interaction/schema';
import { computed, type Tagged } from '../../../models/interaction/tagged';

/**
 * Versioned pricing registry.
 *
 * Rates are USD per **million tokens (per-MTok)** for each usage channel.
 * Bump PRICING_TABLE_VERSION whenever any rate changes so that previously
 * computed costs remain auditable against the table that produced them.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⚠️  PLACEHOLDER RATES — NOT AUTHORITATIVE. VERIFY AGAINST OFFICIAL PRICING. ⚠️
 * The numbers below are reasonable order-of-magnitude placeholders patterned on
 * historical Claude tiers (Haiku < Sonnet < Opus). They MUST be confirmed
 * against published pricing before any figure is presented as real money.
 * Cache-read is conventionally a fraction of input; cache-write a multiple.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** USD per million tokens, per usage channel. */
export interface ModelRates {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

export const PRICING_TABLE_VERSION = '2026-06-01';

export const PRICING_TABLE: Record<string, ModelRates> = {
	// --- PLACEHOLDER per-MTok USD rates — verify before trusting ---
	'claude-opus-4-8': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
	'claude-opus-4-7': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
	'claude-opus-4-6': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
	'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
	'claude-sonnet-4-5': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
	'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 }
};

const PER_MILLION = 1_000_000;

/**
 * Match a (possibly versioned/dated) model id to a pricing table key.
 * Exact match wins; otherwise fall back to the longest known key that is a
 * prefix of the given id (handles ids like `claude-opus-4-8-20260601`).
 */
function resolveModelKey(model: string): string | null {
	if (model in PRICING_TABLE) return model;
	let best: string | null = null;
	for (const key of Object.keys(PRICING_TABLE)) {
		if (model.startsWith(key) && (best === null || key.length > best.length)) {
			best = key;
		}
	}
	return best;
}

/**
 * Compute the USD cost for a usage record under a given model.
 *
 * NULL-HONESTY: returns `computed(null, …)` (not `0`) when the model is unknown
 * or `tokens` is null, so "we can't price this" is never confused with "free".
 */
export function computeCost(
	tokens: Usage | null,
	model: string
): Tagged<number | null> {
	const formula = 'cost_v1';

	if (tokens === null) {
		return computed(null, formula, PRICING_TABLE_VERSION, {
			model,
			reason: 'tokens_null'
		});
	}

	const key = resolveModelKey(model);
	if (key === null) {
		return computed(null, formula, PRICING_TABLE_VERSION, {
			model,
			reason: 'model_not_in_table'
		});
	}

	const rates = PRICING_TABLE[key];
	const cost =
		(tokens.input * rates.input +
			tokens.output * rates.output +
			tokens.cacheRead * rates.cacheRead +
			tokens.cacheWrite * rates.cacheWrite) /
		PER_MILLION;

	return computed(cost, formula, PRICING_TABLE_VERSION, {
		model,
		resolvedModel: key,
		rates,
		unit: 'usd_per_mtok'
	});
}
