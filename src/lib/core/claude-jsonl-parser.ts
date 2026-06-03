import {
	INTERACTION_SCHEMA_VERSION,
	type ContentBlock,
	type Delegation,
	type InteractionEvent,
	type InteractionSession,
	type Participant,
	type ParticipantRole,
	type Usage
} from '../../models/interaction/schema';
import { computed, type Tagged } from '../../models/interaction/tagged';
import { computeCost } from './interaction/pricing';
import { computeAdjacentDurationMs } from './interaction/duration';

/**
 * Parser for Claude Code session logs (`*.jsonl`).
 *
 * Each line of the source file is a JSON object describing one entry in a
 * Claude Code session (a user message, an assistant turn, a tool result, or a
 * system record). This module normalizes that vendor-specific shape into the
 * provider-agnostic {@link InteractionSession} model.
 *
 * Design notes:
 *   - Pure & offline: no network, no store imports, and message content is
 *     never logged.
 *   - Tolerant: blank lines are ignored and malformed JSON lines are skipped
 *     (and counted) rather than aborting the whole parse.
 *   - Provenance-honest: every derived number (cost, duration) is carried as a
 *     `Tagged` value so downstream consumers know where it came from.
 */

/** snake_case usage shape as emitted by Claude Code. */
interface RawUsage {
	input_tokens?: number;
	output_tokens?: number;
	cache_read_input_tokens?: number;
	cache_creation_input_tokens?: number;
}

/** snake_case content block as emitted by Claude Code. */
interface RawContentBlock {
	type?: string;
	// text
	text?: string;
	// thinking
	thinking?: string;
	// tool_use
	id?: string;
	name?: string;
	input?: unknown;
	// tool_result
	tool_use_id?: string;
	is_error?: boolean;
	content?: unknown;
}

interface RawMessage {
	role?: string;
	model?: string;
	stop_reason?: string | null;
	usage?: RawUsage;
	/** user → string OR array; assistant → array. */
	content?: string | RawContentBlock[];
}

/** One parsed JSONL line. */
interface RawEntry {
	uuid?: string;
	parentUuid?: string | null;
	sessionId?: string;
	timestamp?: string;
	cwd?: string;
	gitBranch?: string;
	type?: string;
	subtype?: string;
	durationMs?: number;
	isSidechain?: boolean;
	message?: RawMessage;
}

/** Special participant used for `system` (and otherwise unattributable) lines. */
const SYSTEM_PARTICIPANT: Participant = {
	id: 'system',
	role: 'tool_actor',
	label: 'System'
};

const USER_PARTICIPANT: Participant = {
	id: 'user:main',
	role: 'user',
	label: 'User'
};

function toUsage(raw: RawUsage | undefined): Usage | null {
	if (!raw) return null;
	return {
		input: raw.input_tokens ?? 0,
		output: raw.output_tokens ?? 0,
		cacheRead: raw.cache_read_input_tokens ?? 0,
		cacheWrite: raw.cache_creation_input_tokens ?? 0
	};
}

/** Stringify tool_result content (which may be a string or an array of blocks). */
function stringifyToolResultContent(content: unknown): string {
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		const parts = content.map((block) => {
			if (block && typeof block === 'object' && 'text' in block) {
				const t = (block as { text?: unknown }).text;
				if (typeof t === 'string') return t;
			}
			return JSON.stringify(block);
		});
		return parts.join('\n');
	}
	if (content === null || content === undefined) return '';
	return JSON.stringify(content);
}

function normalizeContent(message: RawMessage | undefined): ContentBlock[] {
	if (!message) return [];
	const { content } = message;

	// A plain human message: content is a string.
	if (typeof content === 'string') {
		return [{ type: 'text', text: content }];
	}
	if (!Array.isArray(content)) return [];

	const blocks: ContentBlock[] = [];
	for (const raw of content) {
		switch (raw?.type) {
			case 'text':
				blocks.push({ type: 'text', text: raw.text ?? '' });
				break;
			case 'thinking':
				blocks.push({ type: 'thinking', text: raw.thinking ?? '' });
				break;
			case 'tool_use':
				blocks.push({
					type: 'tool_use',
					id: raw.id ?? '',
					name: raw.name ?? '',
					input: raw.input
				});
				break;
			case 'tool_result':
				blocks.push({
					type: 'tool_result',
					toolUseId: raw.tool_use_id ?? '',
					content: stringifyToolResultContent(raw.content),
					isError: raw.is_error ?? false
				});
				break;
			default:
				// Unknown block type — skip rather than emit a malformed block.
				break;
		}
	}
	return blocks;
}

const SUBAGENT_TOOL_NAME = 'Agent';

/**
 * Determine which participant an entry is attributed to, creating/deduping the
 * participant in `byId` as needed. Returns the participant id.
 *
 * The role rule:
 *   - user STRING message            → `user`            (id `user:main`)
 *   - user tool_result array         → `tool_actor`      (id `tool:<name>`,
 *                                       name resolved from the matching prior
 *                                       tool_use by tool_use_id)
 *   - assistant w/ a subagent spawn  → `delegated_agent` (id
 *                                       `agent:<subagent_type>:<id[0:8]>`)
 *   - assistant otherwise (text /    → `principal_agent` (id
 *     thinking / non-Agent tool_use)   `claude:<model>:main`)
 *   - isSidechain entries            → the delegated_agent participant they
 *                                       belong to (linked via parentUuid)
 *   - system / anything else         → the shared `System` participant
 */
function resolveParticipant(
	entry: RawEntry,
	byId: Map<string, Participant>,
	toolUseNameById: Map<string, string>,
	sidechainParticipantByUuid: Map<string, string>
): string {
	const register = (p: Participant): string => {
		if (!byId.has(p.id)) byId.set(p.id, p);
		return p.id;
	};

	const message = entry.message;
	const content = message?.content;

	// Sidechain entries are the delegated agent's own activity. They are linked
	// to the spawning Agent tool_use via the parentUuid chain; we resolve the
	// owning delegated_agent participant recorded when the Agent spawn was seen.
	if (entry.isSidechain) {
		const owner = entry.parentUuid
			? sidechainParticipantByUuid.get(entry.parentUuid)
			: undefined;
		if (owner) {
			// Propagate ownership forward so deeper sidechain entries resolve too.
			if (entry.uuid) sidechainParticipantByUuid.set(entry.uuid, owner);
			return owner;
		}
		// Fall through to normal resolution if we can't link the owner.
	}

	if (entry.type === 'user') {
		if (typeof content === 'string') {
			return register(USER_PARTICIPANT);
		}
		if (Array.isArray(content)) {
			// tool_result wrapper → the tool that produced it.
			const result = content.find((b) => b?.type === 'tool_result');
			if (result?.tool_use_id) {
				const toolName = toolUseNameById.get(result.tool_use_id) ?? 'unknown';
				return register({
					id: `tool:${toolName}`,
					role: 'tool_actor',
					label: `Tool:${toolName}`
				});
			}
			// User message with non-tool_result array content → treat as the human.
			return register(USER_PARTICIPANT);
		}
		return register(USER_PARTICIPANT);
	}

	if (entry.type === 'assistant') {
		const model = message?.model ?? 'unknown';
		const blocks = Array.isArray(content) ? content : [];

		// A subagent spawn: assistant emits a tool_use with name === 'Agent'.
		const spawn = blocks.find(
			(b) => b?.type === 'tool_use' && b.name === SUBAGENT_TOOL_NAME
		);
		if (spawn) {
			const subagentType =
				(spawn.input && typeof spawn.input === 'object'
					? ((spawn.input as { subagent_type?: unknown }).subagent_type as
							| string
							| undefined)
					: undefined) ?? 'agent';
			const shortId = (spawn.id ?? '').slice(0, 8);
			const id = `agent:${subagentType}:${shortId}`;
			register({
				id,
				role: 'delegated_agent',
				label: `Agent:${subagentType}`
			});
			// Record the owning participant against the spawning tool_use id so
			// the delegated agent's sidechain entries (which chain off this uuid)
			// attribute to it.
			if (spawn.id) sidechainParticipantByUuid.set(spawn.id, id);
			if (entry.uuid) sidechainParticipantByUuid.set(entry.uuid, id);
			return id;
		}

		// Ordinary assistant turn (text / thinking / non-Agent tool_use).
		return register({
			id: `claude:${model}:main`,
			role: 'principal_agent',
			label: 'Claude'
		});
	}

	// system + everything else.
	return register(SYSTEM_PARTICIPANT);
}

/** Result of a tolerant line split: parsed entries plus a malformed count. */
interface SplitResult {
	entries: RawEntry[];
	malformedLines: number;
}

function splitLines(text: string): SplitResult {
	const entries: RawEntry[] = [];
	let malformedLines = 0;
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;
		try {
			entries.push(JSON.parse(trimmed) as RawEntry);
		} catch {
			// Skip & count malformed lines instead of failing the whole parse.
			malformedLines += 1;
		}
	}
	return { entries, malformedLines };
}

/**
 * Parse a Claude Code `*.jsonl` session log into the canonical
 * {@link InteractionSession} model.
 */
export function parseClaudeJsonl(
	text: string,
	opts?: { sourceUri?: string | null }
): InteractionSession {
	const { entries, malformedLines } = splitLines(text);

	// First pass: index tool_use ids → tool name so that the corresponding
	// tool_result lines can be attributed to the right tool_actor.
	const toolUseNameById = new Map<string, string>();
	for (const entry of entries) {
		const content = entry.message?.content;
		if (Array.isArray(content)) {
			for (const block of content) {
				if (block?.type === 'tool_use' && block.id && block.name) {
					toolUseNameById.set(block.id, block.name);
				}
			}
		}
	}

	const participantsById = new Map<string, Participant>();
	const sidechainParticipantByUuid = new Map<string, string>();
	// uuid → participantId, used to resolve delegation.parentParticipantId.
	const participantByUuid = new Map<string, string>();

	const modelInventory = new Set<string>();
	const toolInventory = new Set<string>();

	const events: InteractionEvent[] = [];
	const timestamps: string[] = [];

	// Map each non-system entry index to its file position so adjacent-duration
	// uses the next real event's timestamp.
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];

		const participantId = resolveParticipant(
			entry,
			participantsById,
			toolUseNameById,
			sidechainParticipantByUuid
		);
		if (entry.uuid) participantByUuid.set(entry.uuid, participantId);

		// system turn_duration lines are metadata, not interaction events; they
		// supply duration for the turn they conclude rather than standing alone.
		if (entry.type === 'system') {
			continue;
		}

		const contentBlocks = normalizeContent(entry.message);
		const tokens = toUsage(entry.message?.usage);
		const model = entry.message?.model ?? '';
		if (entry.type === 'assistant' && model) modelInventory.add(model);

		for (const block of contentBlocks) {
			if (block.type === 'tool_use' && block.name) {
				toolInventory.add(block.name);
			}
		}

		const timestampIso = entry.timestamp ?? '';
		if (timestampIso) timestamps.push(timestampIso);

		// Duration: prefer an immediately-following system turn_duration that
		// concludes this entry; otherwise fall back to the adjacent-timestamp gap.
		let durationMs: Tagged<number | null>;
		const next = entries[i + 1];
		if (next?.type === 'system' && next.subtype === 'turn_duration') {
			durationMs = computed(next.durationMs ?? null, 'turn_duration_observed_v1', undefined, {
				source: 'system_turn_duration'
			});
		} else {
			const nextTs = next?.timestamp ?? null;
			durationMs = computeAdjacentDurationMs(timestampIso, nextTs);
		}

		const delegation: Delegation = {
			parentParticipantId: entry.parentUuid
				? participantByUuid.get(entry.parentUuid) ?? null
				: null,
			isSidechain: !!entry.isSidechain
		};

		const event: InteractionEvent = {
			eventId: entry.uuid ?? `event-${i}`,
			parentEventId: entry.parentUuid ?? null,
			sequence: i,
			participantId,
			timestampIso,
			durationMs,
			contentBlocks,
			stopReason: entry.message?.stop_reason ?? null,
			tokens,
			costUsd: computeCost(tokens, model),
			delegation
		};
		events.push(event);
	}

	// Session meta.
	const sessionId =
		entries.find((e) => e.sessionId)?.sessionId ?? 'unknown-session';
	const observedTimestamps = entries
		.map((e) => e.timestamp)
		.filter((t): t is string => typeof t === 'string' && t.length > 0);
	const startedAtIso = observedTimestamps[0] ?? null;
	const endedAtIso =
		observedTimestamps.length > 0
			? observedTimestamps[observedTimestamps.length - 1]
			: null;
	const sessionDurationMs: Tagged<number | null> =
		startedAtIso && endedAtIso
			? computed(
					new Date(endedAtIso).getTime() - new Date(startedAtIso).getTime(),
					'session_span_v1',
					undefined,
					{ startedAtIso, endedAtIso }
			  )
			: computed(null, 'session_span_v1', undefined, { reason: 'no_timestamps' });

	return {
		schemaVersion: INTERACTION_SCHEMA_VERSION,
		sourceFormat: 'claude_code_jsonl',
		sourceUri: opts?.sourceUri ?? null,
		session: {
			sessionId,
			startedAtIso,
			endedAtIso,
			durationMs: sessionDurationMs,
			modelInventory: [...modelInventory],
			toolInventory: [...toolInventory]
		},
		participants: [...participantsById.values()],
		events,
		categorizations: {
			computed: {
				eventCount: events.length,
				malformedLines,
				costFormula: 'cost_v1',
				durationFormula: 'duration_adjacent_v1'
			},
			inferred: {}
		},
		outputs: {}
	};
}
