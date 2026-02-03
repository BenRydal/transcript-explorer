import { writable, get } from 'svelte/store';
import type { DataPoint } from '../models/dataPoint';

const MAX_HISTORY = 50;

interface HistoryState {
	past: DataPoint[][];
	future: DataPoint[][];
}

function createHistoryStore() {
	const { subscribe, set, update } = writable<HistoryState>({
		past: [],
		future: []
	});

	const snapshot = (wordArray: DataPoint[]) =>
		wordArray.map((dp) => dp.copyWith());

	return {
		subscribe,

		pushState(wordArray: DataPoint[]) {
			update((h) => ({
				past: [...h.past.slice(-(MAX_HISTORY - 1)), snapshot(wordArray)],
				future: []
			}));
		},

		undo(currentWordArray: DataPoint[]): DataPoint[] | null {
			const state = get({ subscribe });
			if (state.past.length === 0) return null;

			const newPast = [...state.past];
			const previousState = newPast.pop()!;

			set({
				past: newPast,
				future: [...state.future, snapshot(currentWordArray)]
			});

			return previousState;
		},

		redo(currentWordArray: DataPoint[]): DataPoint[] | null {
			const state = get({ subscribe });
			if (state.future.length === 0) return null;

			const newFuture = [...state.future];
			const nextState = newFuture.pop()!;

			set({
				past: [...state.past, snapshot(currentWordArray)],
				future: newFuture
			});

			return nextState;
		},

		// Clear history (e.g., when loading new transcript)
		clear() {
			set({ past: [], future: [] });
		}
	};
}

const HistoryStore = createHistoryStore();
export default HistoryStore;
