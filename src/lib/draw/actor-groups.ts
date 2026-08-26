import type { SpeakerRole } from '../../models/user';

/**
 * Collapsing an agentic transcript's speakers onto the kind of participant
 * each one is.
 *
 * A multi-agent session carries 25 actors, and nine of those lanes hold their
 * entire activity inside 100 pixels at figure width -- they cannot render
 * their own content, so a per-actor lane shows the reader less than a grouped
 * one, not more. Grouping also answers a question the per-actor view cannot:
 * how work divides across KINDS of participant, rather than across
 * individuals that are hard to tell apart.
 */
export type ActorGroup = 'person' | 'primary' | 'agents' | 'tools';

/** Display order, coarsest participant first. */
export const ACTOR_GROUP_ORDER: readonly ActorGroup[] = ['person', 'primary', 'agents', 'tools'] as const;

export const ACTOR_GROUP_LABELS: Record<ActorGroup, string> = {
	person: 'Person',
	primary: 'Primary AI',
	agents: 'Agents',
	tools: 'Tools'
};

/**
 * Base hues, matching `actor-colors.ts` so a grouped lane is the same colour
 * family as the actors it stands for.
 */
export const ACTOR_GROUP_COLORS: Record<ActorGroup, string> = {
	person: '#E69F00',
	primary: '#0072B2',
	agents: '#009E73',
	tools: '#CC79A7'
};

const TOOL_PREFIX = 'TOOL:';
const AGENT_PREFIX = 'AGENT:';

/**
 * Which group a speaker belongs to.
 *
 * Role alone cannot separate a delegated agent from the primary AI -- an
 * agent's own rows are recorded as `assistant` -- so the converter's name
 * prefix decides, the same reasoning `actor-colors.ts` gives. Anything that
 * declares no role at all is treated as the person, which is what a human
 * transcript's speakers are.
 */
export function actorGroupOf(speaker: string, role: SpeakerRole | undefined): ActorGroup {
	const upper = speaker.toUpperCase();
	// Name before role, in both directions. A delegated agent's rows are
	// recorded as `assistant`, and `Tool:Agent` -- the tool that spawns them --
	// carries the `agent` role on its markers, so role alone gets both wrong.
	if (upper.startsWith(TOOL_PREFIX)) return 'tools';
	if (upper.startsWith(AGENT_PREFIX)) return 'agents';
	if (role === 'agent') return 'agents';
	if (role === 'tool') return 'tools';
	if (role === 'assistant') return 'primary';
	return 'person';
}

/**
 * Groups present in a set of speakers, in display order. Empty groups are
 * dropped so a chat transcript does not draw two empty lanes.
 */
export function groupsPresent(speakers: readonly string[], roles: ReadonlyMap<string, SpeakerRole | undefined>): ActorGroup[] {
	const seen = new Set<ActorGroup>();
	for (const speaker of speakers) seen.add(actorGroupOf(speaker, roles.get(speaker)));
	return ACTOR_GROUP_ORDER.filter((g) => seen.has(g));
}

/** How many speakers each present group stands for, for labelling a lane. */
export function groupSizes(speakers: readonly string[], roles: ReadonlyMap<string, SpeakerRole | undefined>): Map<ActorGroup, number> {
	const sizes = new Map<ActorGroup, number>();
	for (const speaker of speakers) {
		const group = actorGroupOf(speaker, roles.get(speaker));
		sizes.set(group, (sizes.get(group) ?? 0) + 1);
	}
	return sizes;
}
