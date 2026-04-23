import { writable } from 'svelte/store';

/**
 * Lightweight non-blocking toast layer. Separate from the existing
 * `notificationStore` (which is alert-style and rendered via
 * ToastContainer.svelte) — this is the leaner API requested by the
 * nav-polish pass: call `pushToast("message", kind)` from any site and
 * the root-level Toast.svelte portal renders it with the shared
 * motion + semantic left-border styling.
 */
export type ToastKind = 'info' | 'success' | 'error';

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
 * Push a toast. Default duration is 2500ms; pass 0 to require manual
 * dismissal. Returns the toast id so callers can dismiss programmatically.
 */
export function pushToast(
	message: string,
	kind: ToastKind = 'info',
	durationMs = 2500
): string {
	const id = newId();
	const expiresAt = Date.now() + durationMs;
	update((list) => [...list, { id, message, kind, expiresAt }]);
	if (durationMs > 0) {
		setTimeout(() => dismiss(id), durationMs);
	}
	return id;
}

export const toasts = { subscribe, dismiss };
