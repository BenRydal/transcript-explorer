import { writable } from 'svelte/store';
import { stopPlayback } from './videoStore';

const TranscribeModeStore = writable({ isActive: false });

export function enter(): void {
	stopPlayback();
	TranscribeModeStore.set({ isActive: true });
}

export function exit(): void {
	TranscribeModeStore.set({ isActive: false });
}

export function toggle(): void {
	TranscribeModeStore.update((state) => ({ isActive: !state.isActive }));
}

export default TranscribeModeStore;
