import { writable } from 'svelte/store';
import type { InteractionSession } from '../models/interaction/schema';

/**
 * Holds the currently-loaded normalized interaction session (or `null` when no
 * session has been ingested yet).
 */
const InteractionStore = writable<InteractionSession | null>(null);

export function setInteractionSession(s: InteractionSession): void {
	InteractionStore.set(s);
}

export function clearInteractionSession(): void {
	InteractionStore.set(null);
}

export default InteractionStore;
