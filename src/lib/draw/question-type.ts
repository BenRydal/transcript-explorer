import type { SpeakerRole } from '../../models/user';

/** What kind of questioning move a question node represents. */
export type QuestionKind = 'conversational' | 'elicitation' | 'inter-agent';

/** Prefixes the converter writes for tool and delegated-agent speakers. */
const TOOL_PREFIX = 'TOOL:';
const AGENT_PREFIX = 'AGENT:';

/** Classifies a question by who raised it. */
export function classifyQuestion(speaker: string, role: SpeakerRole | undefined, isAiTranscript: boolean): QuestionKind {
	if (!isAiTranscript) return 'conversational';

	const upper = speaker.toUpperCase();
	if (role === 'agent' || upper.startsWith(AGENT_PREFIX)) return 'inter-agent';
	if (role === 'tool' || upper.startsWith(TOOL_PREFIX)) return 'elicitation';
	return 'conversational';
}

/** Kinds present in a set of questions, in a stable order for the legend. */
export function kindsPresent(kinds: readonly QuestionKind[]): QuestionKind[] {
	const order: QuestionKind[] = ['conversational', 'elicitation', 'inter-agent'];
	const seen = new Set(kinds);
	return order.filter((k) => seen.has(k));
}

export const KIND_LABELS: Record<QuestionKind, string> = {
	conversational: 'Conversational',
	elicitation: 'Structured elicitation',
	'inter-agent': 'Inter-agent'
};
