import type { SpeakerRole } from '../../models/user';

/** Collapsing an agentic transcript's speakers onto the kind of participant each one is. */
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

/** Which group a speaker belongs to. */
export function actorGroupOf(speaker: string, role: SpeakerRole | undefined): ActorGroup {
	const upper = speaker.toUpperCase();
	// Name before role: an agent's rows say `assistant`, and Tool:CreateAgent's
	// markers say `agent`, so role alone gets both backwards.
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
 *
 * `keepEmpty` overrides that for figure capture. Lane height is the drawing
 * area divided by the lane count, so dropping empty groups gives a chat
 * transcript 2 lanes against a multi-agent transcript's 4 and makes the same
 * turn length draw twice as tall in the quieter session. Keeping all four
 * fixes the divisor, and the empty lanes are themselves the finding: this
 * session had no agents and no tools.
 */
export function groupsPresent(speakers: readonly string[], roles: ReadonlyMap<string, SpeakerRole | undefined>, keepEmpty = false): ActorGroup[] {
	if (keepEmpty) return [...ACTOR_GROUP_ORDER];
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
