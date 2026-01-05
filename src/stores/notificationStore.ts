import { writable } from 'svelte/store';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
	id: string;
	type: NotificationType;
	message: string;
}

function createNotificationStore() {
	const { subscribe, update } = writable<Notification[]>([]);

	function dismiss(id: string) {
		update((n) => n.filter((x) => x.id !== id));
	}

	function show(type: NotificationType, message: string, duration = 4000) {
		const id = crypto.randomUUID();
		update((n) => [...n, { id, type, message }]);
		if (duration > 0) setTimeout(() => dismiss(id), duration);
	}

	return {
		subscribe,
		dismiss,
		success: (msg: string) => show('success', msg),
		error: (msg: string) => show('error', msg, 6000),
		warning: (msg: string) => show('warning', msg),
		info: (msg: string) => show('info', msg)
	};
}

export const notifications = createNotificationStore();
