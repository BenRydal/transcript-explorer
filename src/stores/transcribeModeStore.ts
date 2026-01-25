import { writable } from 'svelte/store';

const TranscribeModeStore = writable({ isActive: false });

export function enter(): void {
	TranscribeModeStore.set({ isActive: true });
}

export function exit(): void {
	TranscribeModeStore.set({ isActive: false });
}

export function toggle(): void {
	TranscribeModeStore.update((state) => ({ isActive: !state.isActive }));
}

export default TranscribeModeStore;
