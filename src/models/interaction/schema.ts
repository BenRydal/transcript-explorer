import type { Tagged } from './tagged';

/**
 * Canonical, provider-agnostic interaction model.
 *
 * This is the normalized shape that source adapters (e.g. the Claude Code JSONL
 * parser) produce and that all visualization / analysis code consumes. It is
 * deliberately decoupled from any single vendor's log format.
 */
export const INTERACTION_SCHEMA_VERSION = '0.0.1';

/**
 * Normalized role of a participant in the interaction.
 *   - `user`            — the human operator
 *   - `principal_agent` — the top-level assistant driving the session
 *   - `tool_actor`      — a tool/function invocation + its result
 *   - `delegated_agent` — a sub-agent spawned by the principal (sidechain)
 */
export type ParticipantRole =
	| 'user'
	| 'principal_agent'
	| 'tool_actor'
	| 'delegated_agent';

export interface Participant {
	id: string;
	role: ParticipantRole;
	label: string;
}

export type ContentBlock =
	| { type: 'text'; text: string }
	| { type: 'thinking'; text: string }
	| { type: 'tool_use'; id: string; name: string; input: unknown }
	| { type: 'tool_result'; toolUseId: string; content: string; isError: boolean };

export interface Usage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

export interface Delegation {
	parentParticipantId: string | null;
	isSidechain: boolean;
}

export interface InteractionEvent {
	eventId: string;
	parentEventId: string | null;
	sequence: number;
	participantId: string;
	timestampIso: string;
	durationMs: Tagged<number | null>;
	contentBlocks: ContentBlock[];
	stopReason: string | null;
	tokens: Usage | null;
	costUsd: Tagged<number | null>;
	delegation: Delegation;
}

export interface SessionMeta {
	sessionId: string;
	startedAtIso: string | null;
	endedAtIso: string | null;
	durationMs: Tagged<number | null>;
	modelInventory: string[];
	toolInventory: string[];
}

export interface InteractionSession {
	/** INTERACTION_SCHEMA_VERSION */
	schemaVersion: string;
	/** 'claude_code_jsonl' */
	sourceFormat: string;
	sourceUri: string | null;
	session: SessionMeta;
	participants: Participant[];
	events: InteractionEvent[];
	categorizations: {
		computed: Record<string, unknown>;
		inferred: Record<string, unknown>;
	};
	outputs: Record<string, unknown>;
}
