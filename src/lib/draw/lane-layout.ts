/**
 * Lane and mark layout shared by the lane-based views. Pure, so it can be
 * exercised without a canvas.
 */

export type LaneOrder = 'uptake' | 'default' | 'alpha';

export interface LanePartition {
	/** Lanes that carry at least one occurrence, in display order. */
	present: string[];
	/** Lanes that carry none. Kept so their count can be reported. */
	absent: string[];
}

/** Orders speakers for display. */
export function orderLanes(speakers: readonly string[], counts: ReadonlyMap<string, number>, order: LaneOrder): string[] {
	const original = new Map(speakers.map((s, i) => [s, i]));
	const ordered = [...speakers];

	if (order === 'alpha') {
		ordered.sort((a, b) => a.localeCompare(b));
	} else if (order === 'uptake') {
		ordered.sort((a, b) => {
			const delta = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
			return delta !== 0 ? delta : (original.get(a) ?? 0) - (original.get(b) ?? 0);
		});
	}

	return ordered;
}

/** Splits ordered lanes into those carrying the token and those that don't. */
export function partitionLanes(ordered: readonly string[], counts: ReadonlyMap<string, number>): LanePartition {
	const present: string[] = [];
	const absent: string[] = [];
	for (const speaker of ordered) {
		((counts.get(speaker) ?? 0) > 0 ? present : absent).push(speaker);
	}
	return { present, absent };
}

/** Shortens a label to fit `maxWidth`, cutting from the middle. */
export function truncateMiddle(label: string, maxWidth: number, measure: (text: string) => number): string {
	// A non-positive budget is no room at all, so returning the label would
	// overflow the gutter it was meant to fit.
	if (maxWidth <= 0) return '';
	if (measure(label) <= maxWidth) return label;

	const ellipsis = '…';
	if (measure(ellipsis) > maxWidth) return '';

	// Head grows first, so the actor-kind prefix survives a tight gutter.
	let head = 0;
	let tail = 0;
	for (;;) {
		const nextHead = head + 1;
		const canGrowHead = nextHead + tail < label.length && measure(label.slice(0, nextHead) + ellipsis + label.slice(label.length - tail)) <= maxWidth;
		if (canGrowHead) head = nextHead;

		const nextTail = tail + 1;
		const canGrowTail = head + nextTail < label.length && measure(label.slice(0, head) + ellipsis + label.slice(label.length - nextTail)) <= maxWidth;
		if (canGrowTail) tail = nextTail;

		if (!canGrowHead && !canGrowTail) break;
	}

	if (head === 0 && tail === 0) return ellipsis;
	return label.slice(0, head) + ellipsis + label.slice(label.length - tail);
}

export interface Clusterable {
	x: number;
	speaker: string;
}

export interface Cluster<T extends Clusterable> {
	members: T[];
	/** Midpoint of the members' true positions, so the mark stays on its data. */
	x: number;
	speaker: string;
}

/** Merges marks that land within `minGap` pixels of each other in the same lane. */
export function clusterByLane<T extends Clusterable>(items: readonly T[], minGap: number): Cluster<T>[] {
	const byLane = new Map<string, T[]>();
	for (const item of items) {
		const bucket = byLane.get(item.speaker);
		if (bucket) bucket.push(item);
		else byLane.set(item.speaker, [item]);
	}

	const clusters: Cluster<T>[] = [];
	for (const [speaker, laneItems] of byLane) {
		let current: T[] = [];
		for (const item of laneItems) {
			if (current.length > 0 && item.x - current[current.length - 1].x > minGap) {
				clusters.push(makeCluster(current, speaker));
				current = [];
			}
			current.push(item);
		}
		if (current.length > 0) clusters.push(makeCluster(current, speaker));
	}

	return clusters;
}

function makeCluster<T extends Clusterable>(members: T[], speaker: string): Cluster<T> {
	const first = members[0].x;
	const last = members[members.length - 1].x;
	return { members, x: (first + last) / 2, speaker };
}

/**
 * Radius for a cluster of `n` marks. Area tracks the count, matching the
 * square-root convention used by the turn chart and turn network.
 */
export function clusterRadius(n: number, base: number, cap: number): number {
	if (n <= 1) return base;
	return Math.min(cap, base * Math.sqrt(n));
}
