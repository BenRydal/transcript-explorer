import { writable } from 'svelte/store';

/**
 * Single non-blocking toast layer, rendered by the root-level Toast.svelte
 * portal with shared motion + semantic left-border styling. Use the `toast.*`
 * helpers (success/error/warning/info) or the lower-level `pushToast`.
 */
export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
	id: string;
	message: string;
	kind: ToastKind;
	expiresAt: number;
}

const { subscribe, update } = writable<Toast[]>([]);

function newId(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
		return crypto.randomUUID();
	}
	return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function dismiss(id: string): void {
	update((list) => list.filter((t) => t.id !== id));
}

/**
 * Push a toast. Default duration 2500ms; pass 0 to require manual dismissal.
 * Returns the toast id so callers can dismiss programmatically.
 */
export function pushToast(message: string, kind: ToastKind = 'info', durationMs = 2500): string {
	const id = newId();
	const expiresAt = Date.now() + durationMs;
	update((list) => [...list, { id, message, kind, expiresAt }]);
	if (durationMs > 0) {
		setTimeout(() => dismiss(id), durationMs);
	}
	return id;
}

/** Convenience helpers; errors linger longer. */
export const toast = {
	success: (msg: string) => pushToast(msg, 'success'),
	error: (msg: string) => pushToast(msg, 'error', 6000),
	warning: (msg: string) => pushToast(msg, 'warning', 4000),
	info: (msg: string) => pushToast(msg, 'info', 4000)
};

export const toasts = { subscribe, dismiss };
