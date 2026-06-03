/**
 * Provenance-tagged values.
 *
 * Every derived quantity in the interaction model carries a `provenance` tag so
 * downstream consumers (and the UI) can be honest about WHERE a number came
 * from:
 *   - `observed`  — read verbatim from the source log (ground truth)
 *   - `computed`  — deterministically derived from observed data via a named
 *                   formula (e.g. cost from tokens, duration from timestamps)
 *   - `inferred`  — produced by a heuristic / estimate (e.g. idle time)
 *
 * NULL-HONESTY: when a value cannot be derived it should be carried as `null`
 * (not `0`) so the absence of information is never silently rendered as a real
 * measurement.
 */
export type Provenance = 'observed' | 'computed' | 'inferred';

export interface Tagged<T> {
	value: T;
	provenance: Provenance;
	/** computed: formula id/name */
	formula?: string;
	/** computed: e.g. pricing_table_version */
	version?: string;
	/** inferred: rule params; computed: inputs/caveats */
	params?: Record<string, unknown>;
}

export const observed = <T>(value: T): Tagged<T> => ({
	value,
	provenance: 'observed'
});

export const computed = <T>(
	value: T,
	formula: string,
	version?: string,
	params?: Record<string, unknown>
): Tagged<T> => ({
	value,
	provenance: 'computed',
	formula,
	version,
	params
});

export const inferred = <T>(
	value: T,
	formula: string,
	params?: Record<string, unknown>
): Tagged<T> => ({
	value,
	provenance: 'inferred',
	formula,
	params
});
