import { writable } from 'svelte/store';

/**
 * Recently-loaded transcripts. Persisted to localStorage so the nav's
 * Transcript menu can surface a "Recents" section across reloads.
 *
 * Kind distinguishes built-in examples (stable id from EXAMPLES catalog)
 * from user uploads (filename-derived). Cap at MAX_RECENTS; dedupe by
 * id + kind on push so reloading the same example doesn't bloat the
 * list.
 */
export interface RecentEntry {
	id: string;
	label: string;
	kind: 'example' | 'upload';
	loadedAt: number;
}

export const MAX_RECENTS = 5;

const STORAGE_KEY = 'te:recents';

function readPersisted(): RecentEntry[] {
	if (typeof window === 'undefined') return [];
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter(
				(x): x is RecentEntry =>
					typeof x === 'object' &&
					x !== null &&
					typeof x.id === 'string' &&
					typeof x.label === 'string' &&
					(x.kind === 'example' || x.kind === 'upload') &&
					typeof x.loadedAt === 'number'
			)
			.slice(0, MAX_RECENTS);
	} catch {
		return [];
	}
}

const { subscribe, set, update } = writable<RecentEntry[]>(readPersisted());

if (typeof window !== 'undefined') {
	subscribe((value) => {
		try {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
		} catch {
			// Best-effort persistence; quota / disabled localStorage is a no-op.
		}
	});
}

export const recents = {
	subscribe,
	/**
	 * Record a transcript load. Dedupes by (kind, id) — a repeat load
	 * moves the entry to the top and refreshes its loadedAt timestamp.
	 */
	push(entry: Omit<RecentEntry, 'loadedAt'>): void {
		update((list) => {
			const filtered = list.filter((r) => !(r.id === entry.id && r.kind === entry.kind));
			const next = [{ ...entry, loadedAt: Date.now() }, ...filtered];
			return next.slice(0, MAX_RECENTS);
		});
	},
	clear(): void {
		set([]);
	}
};
