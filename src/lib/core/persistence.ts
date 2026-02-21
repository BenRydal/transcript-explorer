import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { DataPoint } from '../../models/dataPoint';
import { Transcript, type TimingMode } from '../../models/transcript';
import type { User } from '../../models/user';
import TranscriptStore from '../../stores/transcriptStore';
import UserStore from '../../stores/userStore';
import CodeStore, { type CodeEntry } from '../../stores/codeStore';
import ConfigStore from '../../stores/configStore';

const STORAGE_KEY = 'transcript-explorer-autosave';

interface PersistedDataPoint {
	speaker: string;
	turnNumber: number;
	startTime: number;
	endTime: number;
	word: string;
	count: number;
	codes?: string[];
}

interface PersistedTranscript {
	wordArray: PersistedDataPoint[];
	totalTimeInSeconds: number;
	totalConversationTurns: number;
	totalNumOfWords: number;
	largestTurnLength: number;
	largestNumOfWordsByASpeaker: number;
	largestNumOfTurnsByASpeaker: number;
	maxCountOfMostRepeatedWord: number;
	mostFrequentWord: string;
	timingMode: TimingMode;
}

interface PersistedUser {
	enabled: boolean;
	name: string;
	color: string;
}

interface PersistedState {
	transcript: PersistedTranscript;
	users: PersistedUser[];
	codes?: CodeEntry[];
	codeColorMode?: boolean;
	showUncoded?: boolean;
	savedAt: number;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function saveState(): void {
	if (!browser) return;

	const transcript = get(TranscriptStore);
	const users = get(UserStore);
	const codes = get(CodeStore);
	const config = get(ConfigStore);

	if (transcript.wordArray.length === 0) {
		return;
	}

	const state: PersistedState = {
		transcript: {
			wordArray: transcript.wordArray.map((dp) => ({
				speaker: dp.speaker,
				turnNumber: dp.turnNumber,
				startTime: dp.startTime,
				endTime: dp.endTime,
				word: dp.word,
				count: dp.count,
				codes: dp.codes.length > 0 ? dp.codes : undefined
			})),
			totalTimeInSeconds: transcript.totalTimeInSeconds,
			totalConversationTurns: transcript.totalConversationTurns,
			totalNumOfWords: transcript.totalNumOfWords,
			largestTurnLength: transcript.largestTurnLength,
			largestNumOfWordsByASpeaker: transcript.largestNumOfWordsByASpeaker,
			largestNumOfTurnsByASpeaker: transcript.largestNumOfTurnsByASpeaker,
			maxCountOfMostRepeatedWord: transcript.maxCountOfMostRepeatedWord,
			mostFrequentWord: transcript.mostFrequentWord,
			timingMode: transcript.timingMode
		},
		users: users.map((u) => ({
			enabled: u.enabled,
			name: u.name,
			color: u.color
		})),
		codes: codes.length > 0 ? codes : undefined,
		codeColorMode: config.codeColorMode || undefined,
		showUncoded: config.showUncoded === false ? false : undefined,
		savedAt: Date.now()
	};

	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch (e) {
		console.error('Failed to save state to localStorage:', e);
	}
}

export function saveStateDebounced(): void {
	if (debounceTimer) {
		clearTimeout(debounceTimer);
	}
	debounceTimer = setTimeout(() => {
		saveState();
		debounceTimer = null;
	}, 2000);
}

export function saveStateImmediate(): void {
	if (debounceTimer) {
		clearTimeout(debounceTimer);
		debounceTimer = null;
	}
	saveState();
}

export function loadState(): PersistedState | null {
	if (!browser) return null;

	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return null;
		return JSON.parse(stored) as PersistedState;
	} catch (e) {
		console.error('Failed to load state from localStorage:', e);
		return null;
	}
}

export function restoreState(): boolean {
	const state = loadState();
	if (!state) return false;

	const transcript = new Transcript();
	transcript.wordArray = state.transcript.wordArray.map((dp) => {
		const dataPoint = new DataPoint(dp.speaker, dp.turnNumber, dp.word, dp.startTime, dp.endTime);
		dataPoint.count = dp.count;
		dataPoint.codes = Array.isArray(dp.codes) ? dp.codes : [];
		return dataPoint;
	});
	transcript.totalTimeInSeconds = state.transcript.totalTimeInSeconds;
	transcript.totalConversationTurns = state.transcript.totalConversationTurns;
	transcript.totalNumOfWords = state.transcript.totalNumOfWords;
	transcript.largestTurnLength = state.transcript.largestTurnLength;
	transcript.largestNumOfWordsByASpeaker = state.transcript.largestNumOfWordsByASpeaker;
	transcript.largestNumOfTurnsByASpeaker = state.transcript.largestNumOfTurnsByASpeaker;
	transcript.maxCountOfMostRepeatedWord = state.transcript.maxCountOfMostRepeatedWord;
	transcript.mostFrequentWord = state.transcript.mostFrequentWord;
	transcript.timingMode = state.transcript.timingMode;

	const users: User[] = state.users.map((u) => ({ name: u.name, color: u.color, enabled: u.enabled }));

	TranscriptStore.set(transcript);
	UserStore.set(users);

	if (state.codes && state.codes.length > 0) {
		CodeStore.set(state.codes);
		ConfigStore.update((c) => ({ ...c, codeColorMode: state.codeColorMode ?? false, showUncoded: state.showUncoded ?? true }));
	}

	return true;
}

export function clearState(): void {
	if (!browser) return;

	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch (e) {
		console.error('Failed to clear state from localStorage:', e);
	}
}

export function getPersistedTimestamp(): number | null {
	const state = loadState();
	if (!state || state.transcript.wordArray.length === 0) return null;
	return state.savedAt;
}
