/**
 * Interaction → Transcript adapter.
 *
 * Projects a normalized {@link InteractionSession} (produced by the Claude Code
 * JSONL parser) onto the existing transcript pipeline so an uploaded agentic
 * session renders in all of the existing visualizations with no viz-specific
 * code. There is NO inference here: every value is read directly off the
 * observed events (timestamps, content blocks, participant labels).
 *
 * Mapping: one EVENT → one TURN. Each event's content blocks are flattened to
 * readable text, the participant's label becomes the speaker, and timing is
 * driven purely by the OBSERVED `timestampIso` of each event (never by
 * computed/inferred durations).
 *
 * The flattened turns are fed through {@link createTranscriptFromParsedText} so
 * the resulting word-level DataPoints are identical in shape to every other
 * source format.
 */

import type { InteractionSession, InteractionEvent, ContentBlock, Participant } from '../../../models/interaction/schema';
import type { ParseResult, ParsedTurn } from '../text-parser';
import { createTranscriptFromParsedText, type TranscriptCreationResult } from '../transcript-factory';

/** Max words kept from a single long text / tool_result block before truncating. */
const MAX_BLOCK_WORDS = 80;

/** Epsilon (seconds) given to the final event so it has a non-zero span. */
const LAST_EVENT_EPSILON = 1;

/** Truncates text to the first `MAX_BLOCK_WORDS` words, noting the truncation. */
function truncateWords(text: string): string {
	const words = text.trim().split(/\s+/);
	if (words.length <= MAX_BLOCK_WORDS) return text.trim();
	return `${words.slice(0, MAX_BLOCK_WORDS).join(' ')} … [truncated ${words.length - MAX_BLOCK_WORDS} words]`;
}

/** Compactly serializes arbitrary tool input to a single-line JSON string. */
function compactJson(input: unknown): string {
	try {
		return JSON.stringify(input ?? null);
	} catch {
		return String(input);
	}
}

/** Renders a single content block as human-readable text. */
function renderBlock(block: ContentBlock): string {
	switch (block.type) {
		case 'text':
			return truncateWords(block.text);
		case 'thinking':
			return `[thinking] ${truncateWords(block.text)}`;
		case 'tool_use':
			return `[tool: ${block.name}] ${compactJson(block.input)}`;
		case 'tool_result':
			return `[result]${block.isError ? ' [error]' : ''} ${truncateWords(block.content)}`;
		default:
			return '';
	}
}

/** Flattens an event's content blocks into a single readable string. */
function renderEvent(event: InteractionEvent): string {
	return event.contentBlocks
		.map(renderBlock)
		.map((s) => s.trim())
		.filter((s) => s.length > 0)
		.join(' ');
}

/**
 * Parses an ISO timestamp to epoch milliseconds, or `null` when unparseable.
 * Observed-only: no fallback synthesis of times.
 */
function toEpochMs(iso: string | null): number | null {
	if (!iso) return null;
	const ms = Date.parse(iso);
	return Number.isNaN(ms) ? null : ms;
}

/**
 * Adapts a normalized interaction session into a transcript creation result
 * compatible with `applyTranscriptResult`.
 */
export function interactionToTranscript(session: InteractionSession): TranscriptCreationResult {
	const participantsById = new Map<string, Participant>(session.participants.map((p) => [p.id, p]));

	// Timing base: earliest observed event timestamp (fall back to the session's
	// declared start only if an event lacks one). All offsets are relative to it.
	const eventEpochs = session.events.map((e) => toEpochMs(e.timestampIso));
	const observedEpochs = eventEpochs.filter((ms): ms is number => ms !== null);
	const baseMs = observedEpochs.length > 0 ? Math.min(...observedEpochs) : 0;

	const turns: ParsedTurn[] = session.events.map((event, index) => {
		const participant = participantsById.get(event.participantId);
		const speaker = participant?.label ?? event.participantId;

		const startEpoch = eventEpochs[index];
		const startTime = startEpoch !== null ? (startEpoch - baseMs) / 1000 : null;

		// endTime = next event's observed start; the final event gets a small
		// epsilon so it occupies a non-zero span. Driven by observed times only.
		let endTime: number | null = null;
		if (startTime !== null) {
			const nextEpoch = eventEpochs.slice(index + 1).find((ms): ms is number => ms !== null);
			endTime = nextEpoch !== undefined ? (nextEpoch - baseMs) / 1000 : startTime + LAST_EVENT_EPSILON;
		}

		return {
			speaker,
			content: renderEvent(event),
			startTime,
			endTime
		};
	});

	const speakers = [...new Set(turns.map((t) => t.speaker))];

	const parseResult: ParseResult = {
		turns,
		detectedFormat: 'timestamped',
		hasTimestamps: true,
		speakers,
		continuationLineCount: 0,
		totalLineCount: turns.length
	};

	// 'startEnd' so each turn keeps its observed start AND end span.
	return createTranscriptFromParsedText(parseResult, 'startEnd');
}
