import type { SourceKind } from '../../models/transcript';
import type { SpeakerRole } from '../../models/user';

/**
 * Column a producer sets to declare that a CSV records an AI session.
 * Written by tools/claude-code-converter.
 */
export const SOURCE_KIND_COLUMN = 'te_source_kind';

const ROLE_COLUMN = 'role';
const EVENT_TYPE_COLUMN = 'event_type';

const KNOWN_ROLES = new Set(['user', 'assistant', 'tool', 'agent', 'system']);
const KNOWN_EVENT_TYPES = new Set([
	'message',
	'tool_call',
	'tool_result',
	'agent_spawn',
	'agent_result',
	'thinking',
	'idle'
]);

/** Share of rows that must carry recognised values before we infer AI. */
const AGREEMENT_THRESHOLD = 0.9;

/**
 * Decides whether parsed CSV rows record an AI session.
 *
 * Detection is deliberately conservative and never looks at speaker names.
 * Human corpora legitimately contain a speaker called "Agent" (call-centre
 * transcripts pair Agent with Customer) and a `role` column holding values like
 * teacher or observer, so a name- or single-column heuristic misfires on real
 * research data. Since AI handling removes rows and changes scaling, a false
 * positive is far more damaging than a false negative.
 *
 * Two ways to qualify:
 *   1. An explicit `te_source_kind` marker, which producers should emit.
 *   2. Failing that, `role` AND `event_type` both present, with at least
 *      90% of rows in each holding values from the known vocabularies.
 *
 * None of the bundled human examples satisfies even the first half of (2).
 */
export function detectSourceKind(rows: Record<string, unknown>[]): SourceKind {
	if (!rows.length) return 'human';

	const declared = String(rows[0][SOURCE_KIND_COLUMN] ?? '').trim().toLowerCase();
	if (declared === 'ai') return 'ai';
	if (declared === 'human') return 'human';

	const first = rows[0];
	if (!(ROLE_COLUMN in first) || !(EVENT_TYPE_COLUMN in first)) return 'human';

	let roleHits = 0;
	let eventHits = 0;
	for (const row of rows) {
		if (KNOWN_ROLES.has(String(row[ROLE_COLUMN] ?? '').trim().toLowerCase())) roleHits++;
		if (KNOWN_EVENT_TYPES.has(String(row[EVENT_TYPE_COLUMN] ?? '').trim().toLowerCase())) eventHits++;
	}

	const enough = rows.length * AGREEMENT_THRESHOLD;
	return roleHits >= enough && eventHits >= enough ? 'ai' : 'human';
}

/**
 * Role for each speaker, taken from the `role` column.
 *
 * Only meaningful once the transcript is known to be AI; callers should not
 * invoke this for human transcripts. A speaker whose rows disagree keeps the
 * first role seen, which matches how the converter emits them.
 */
export function collectSpeakerRoles(
	rows: Record<string, unknown>[]
): Map<string, SpeakerRole> {
	const roles = new Map<string, SpeakerRole>();
	for (const row of rows) {
		const speaker = String(row['speaker'] ?? '').trim().toUpperCase();
		const role = String(row[ROLE_COLUMN] ?? '').trim().toLowerCase();
		if (!speaker || !KNOWN_ROLES.has(role)) continue;
		if (!roles.has(speaker)) roles.set(speaker, role as SpeakerRole);
	}
	return roles;
}
