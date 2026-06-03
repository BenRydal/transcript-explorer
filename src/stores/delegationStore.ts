import { writable } from 'svelte/store';
import type { InteractionSession } from '../models/interaction/schema';

/**
 * Precomputed delegation/adjacency node derived from an InteractionSession.
 * One node per event, carrying parent/child links, the depth from a root
 * (events whose `parentEventId === null`), and whether the event belongs to a
 * delegated sub-agent sidechain.
 */
export interface DelegationNode {
	eventId: string;
	parentEventId: string | null;
	participantId: string;
	isSidechain: boolean;
	depth: number;
	childIds: string[];
}

/**
 * Pure function: build the delegation adjacency for a session.
 *
 * - `childIds` are filled from each event's `parentEventId`.
 * - `depth` is computed via BFS from every root (parentEventId === null).
 * - Events referencing a missing/unknown parent are treated as roots (depth 0)
 *   so the result is always well-defined.
 */
export function buildDelegation(session: InteractionSession): DelegationNode[] {
	const nodes = new Map<string, DelegationNode>();

	for (const event of session.events) {
		nodes.set(event.eventId, {
			eventId: event.eventId,
			parentEventId: event.parentEventId,
			participantId: event.participantId,
			isSidechain: event.delegation.isSidechain,
			depth: 0,
			childIds: []
		});
	}

	// Wire up children (only when the parent actually exists in the map).
	for (const node of nodes.values()) {
		if (node.parentEventId !== null) {
			const parent = nodes.get(node.parentEventId);
			if (parent) {
				parent.childIds.push(node.eventId);
			}
		}
	}

	// Roots: explicit nulls or dangling parents.
	const roots: DelegationNode[] = [];
	for (const node of nodes.values()) {
		if (node.parentEventId === null || !nodes.has(node.parentEventId)) {
			roots.push(node);
		}
	}

	// BFS to assign depth from the roots.
	const visited = new Set<string>();
	const queue: Array<{ id: string; depth: number }> = roots.map((r) => ({
		id: r.eventId,
		depth: 0
	}));

	while (queue.length > 0) {
		const { id, depth } = queue.shift()!;
		if (visited.has(id)) continue;
		visited.add(id);

		const node = nodes.get(id);
		if (!node) continue;
		node.depth = depth;

		for (const childId of node.childIds) {
			if (!visited.has(childId)) {
				queue.push({ id: childId, depth: depth + 1 });
			}
		}
	}

	// Preserve original event ordering.
	return session.events.map((e) => nodes.get(e.eventId)!).filter(Boolean);
}

const DelegationStore = writable<DelegationNode[]>([]);

export function setDelegationFromSession(session: InteractionSession): DelegationNode[] {
	const nodes = buildDelegation(session);
	DelegationStore.set(nodes);
	return nodes;
}

export default DelegationStore;
