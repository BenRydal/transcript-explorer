import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { DataPoint } from '../../models/dataPoint';
import { Transcript, type TimingMode, type SourceKind } from '../../models/transcript';
import type { User, SpeakerRole } from '../../models/user';
import TranscriptStore from '../../stores/transcriptStore';
import UserStore from '../../stores/userStore';
import CodeStore, { type CodeEntry } from '../../stores/codeStore';
import FiltersStore from '../../stores/filtersStore';
import { autosaveStatus } from '../../stores/autosaveStore';

const STORAGE_KEY = 'transcript-explorer-autosave';

/**
 * Above this many words, autosave is skipped.
 *
 * State is serialised one object per word, so a large transcript produces tens
 * of megabytes — far past the ~5 MB localStorage allows. Every attempt threw,
 * the failure was swallowed, and the user was left with a permanent error
 * indicator; the only real effect was a long synchronous stall on the main
 * thread each time a speaker was toggled, and again on tab close.
 *
 * Skipping is honest about what localStorage can hold. Lifting it properly
 * means a storage backend without the quota, not a bigger string.
 */
const MAX_AUTOSAVE_WORDS = 120_000;

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
	sourceKind?: SourceKind;
}

interface PersistedUser {
	enabled: boolean;
	name: string;
	color: string;
	role?: SpeakerRole;
}

/**
 * Bumped when the persisted shape changes incompatibly. State without a version
 * predates this field and is restored as a human transcript.
 */
const STATE_VERSION = 1;

interface PersistedState {
	version?: number;
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
	if (transcript.wordArray.length > MAX_AUTOSAVE_WORDS) {
		// Bail before serialising: the string would be tens of megabytes and the
		// write is guaranteed to be rejected. This is a deliberate skip rather
		// than a failure, so leave the indicator idle instead of showing an
		// error the user can do nothing about.
		autosaveStatus.reset();
		return;
	}
	const users = get(UserStore);
	const codes = get(CodeStore);
	const config = get(FiltersStore);

	if (transcript.wordArray.length === 0) {
		return;
	}

	// Mark the autosave indicator as in-flight. JSON stringify + a
	// localStorage write are synchronous, but we still flip through
	// 'saving' so users see the state transition even on fast writes.
	autosaveStatus.saving();

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
			timingMode: transcript.timingMode,
			sourceKind: transcript.sourceKind
		},
		users: users.map((u) => ({
			enabled: u.enabled,
			name: u.name,
			color: u.color,
			role: u.role
		})),
		codes: codes.length > 0 ? codes : undefined,
		codeColorMode: config.codeColorMode || undefined,
		showUncoded: config.showUncoded === false ? false : undefined,
		savedAt: Date.now(),
		version: STATE_VERSION
	};

	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
		autosaveStatus.saved();
	} catch (e) {
		console.error('Failed to save state to localStorage:', e);
		autosaveStatus.error();
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
		const parsed = JSON.parse(stored) as PersistedState;
		// Guard against a truncated or hand-edited payload: restoring a partial
		// state silently produces a transcript with no words and no speakers.
		if (!parsed || typeof parsed !== 'object') return null;
		if (!parsed.transcript || !Array.isArray(parsed.transcript.wordArray)) return null;
		if (!Array.isArray(parsed.users)) return null;
		if (parsed.version !== undefined && parsed.version > STATE_VERSION) {
			console.warn(
				`Saved session is version ${parsed.version}, newer than this build supports (${STATE_VERSION}). Ignoring it.`
			);
			return null;
		}
		return parsed;
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
	// Absent in sessions saved before source kind existed; those are human.
	transcript.sourceKind = state.transcript.sourceKind ?? 'human';

	const users: User[] = state.users.map((u) => ({
		name: u.name,
		color: u.color,
		enabled: u.enabled,
		role: u.role
	}));

	TranscriptStore.set(transcript);
	UserStore.set(users);

	if (state.codes && state.codes.length > 0) {
		CodeStore.set(state.codes);
		FiltersStore.update((c) => ({ ...c, codeColorMode: state.codeColorMode ?? false, showUncoded: state.showUncoded ?? true }));
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
