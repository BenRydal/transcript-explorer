import type { ParsedTurn } from './text-parser';

/** How many transcript rows one action occupies. */
export type AiTurnGrouping = 'none' | 'tool-uses' | 'agents';

export interface AiTurnEntry {
	turn: ParsedTurn;
	eventType: string;
	toolName: string;
	toolUseId: string;
}

const CALL_EVENTS = new Set(['tool_call', 'agent_spawn']);
const RESULT_EVENTS = new Set(['tool_result', 'agent_result']);
const AGENT_SPEAKER = /^AGENT:/i;

function callerKey(speaker: string, toolName: string): string {
	return JSON.stringify([speaker, toolName]);
}

function isAgentSpeaker(speaker: string | undefined): boolean {
	return !!speaker && AGENT_SPEAKER.test(speaker);
}

/**
 * Result index to the index of the call it answers. Must build its queues in
 * one forward pass: pre-populating lets a result claim a later call.
 */
function pairCallsToResults(entries: AiTurnEntry[]): Map<number, number> {
	const byId = new Map<string, number>();
	const byCaller = new Map<string, number[]>();
	const byTool = new Map<string, number[]>();
	const pairs = new Map<number, number>();

	const push = (map: Map<string, number[]>, key: string, index: number) => {
		const queue = map.get(key);
		if (queue) queue.push(index);
		else map.set(key, [index]);
	};
	const take = (map: Map<string, number[]>, key: string): number | undefined => {
		const queue = map.get(key);
		return queue && queue.length ? queue.shift() : undefined;
	};
	const drop = (index: number) => {
		for (const queue of [...byCaller.values(), ...byTool.values()]) {
			const at = queue.indexOf(index);
			if (at !== -1) queue.splice(at, 1);
		}
	};

	entries.forEach((entry, index) => {
		if (CALL_EVENTS.has(entry.eventType)) {
			if (entry.toolUseId) byId.set(entry.toolUseId, index);
			push(byCaller, callerKey(entry.turn.speaker, entry.toolName), index);
			push(byTool, entry.toolName, index);
			return;
		}
		if (!RESULT_EVENTS.has(entry.eventType)) return;

		let call: number | undefined;
		if (entry.toolUseId && byId.has(entry.toolUseId)) {
			call = byId.get(entry.toolUseId);
			byId.delete(entry.toolUseId);
		} else {
			call = take(byCaller, callerKey(entry.turn.speaker, entry.toolName)) ?? take(byTool, entry.toolName);
		}
		if (call === undefined) return;
		drop(call);
		pairs.set(index, call);
	});

	return pairs;
}

/** Result's speaker wins; `caller` is then the only record of which agent acted. */
function mergePair(call: ParsedTurn, result: ParsedTurn): ParsedTurn {
	const content = [call.content, result.content].filter(Boolean).join('\n');
	const startTime = call.startTime ?? result.startTime;
	let endTime = result.endTime ?? call.endTime;
	if (endTime !== null && startTime !== null && endTime < startTime) endTime = startTime;
	return {
		...result,
		caller: isAgentSpeaker(call.speaker) ? call.speaker : call.caller,
		content,
		startTime,
		endTime
	};
}

/** Folds all of an agent's turns, including ones it made through a tool, into one. */
function collapseAgents(turns: ParsedTurn[]): ParsedTurn[] {
	const hosts = new Map<string, ParsedTurn>();
	const out: ParsedTurn[] = [];

	for (const turn of turns) {
		const agent = isAgentSpeaker(turn.speaker) ? turn.speaker : isAgentSpeaker(turn.caller) ? turn.caller! : null;
		if (!agent) {
			out.push(turn);
			continue;
		}
		const host = hosts.get(agent);
		if (!host) {
			const seed: ParsedTurn = { ...turn, speaker: agent, caller: undefined };
			hosts.set(agent, seed);
			out.push(seed);
			continue;
		}
		host.content = [host.content, turn.content].filter(Boolean).join('\n');
		if (turn.startTime !== null && (host.startTime === null || turn.startTime < host.startTime)) host.startTime = turn.startTime;
		if (turn.endTime !== null && (host.endTime === null || turn.endTime > host.endTime)) host.endTime = turn.endTime;
	}

	return out;
}

/** Regroups AI turns so one action is one turn. Callers gate this on an AI source. */
export function groupAiTurns(entries: AiTurnEntry[], mode: AiTurnGrouping): ParsedTurn[] {
	if (mode === 'none') return entries.map((entry) => entry.turn);

	const pairs = pairCallsToResults(entries);
	const consumed = new Set(pairs.values());
	const merged: ParsedTurn[] = [];

	entries.forEach((entry, index) => {
		if (consumed.has(index)) return;
		const call = pairs.get(index);
		merged.push(call === undefined ? entry.turn : mergePair(entries[call].turn, entry.turn));
	});

	return mode === 'agents' ? collapseAgents(merged) : merged;
}
