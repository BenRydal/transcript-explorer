import type p5 from 'p5';
import Papa from 'papaparse';

import { CoreUtils } from './core-utils';
import { DataPoint } from '../../models/dataPoint.js';
import { User } from '../../models/user.js';
import { USER_COLORS } from '../constants/index.js';

import UserStore from '../../stores/userStore';
import TimelineStore from '../../stores/timelineStore';
import TranscriptStore from '../../stores/transcriptStore.js';
import { loadVideo, reset as resetVideo } from '../../stores/videoStore';
import { Transcript, type TimingMode } from '../../models/transcript';
import ConfigStore from '../../stores/configStore.js';
import { notifications } from '../../stores/notificationStore.js';

import { TimeUtils } from './time-utils.js';
let transcript: Transcript = new Transcript();
let users: User[] = [];

TranscriptStore.subscribe((data) => {
	transcript = data;
});

UserStore.subscribe((data) => {
	users = data;
});

const examples = {
	'example-1': {
		// MOS
		files: ['conversation.csv'],
		videoId: 'd8_pRUR-hmg'
	},
	'example-2': {
		// Bluegrass
		files: ['conversation.csv'],
		videoId: 'pWJ3xNk1Zpg'
	},
	'example-3': {
		// Sean Numbers
		files: ['conversation.csv'],
		videoId: 'OJSZCK4GPQY'
	},
	'example-4': {
		// TIMSS
		files: ['conversation.csv'],
		videoId: 'Iu0rxb-xkMk'
	},
	'example-5': {
		// Biden/Trump Debate 2020
		files: ['conversation.csv'],
		videoId: 'yW8nIA33-zY'
	}
};

export class Core {
	sketch: p5;
	coreUtils: CoreUtils;

	constructor(sketch: p5) {
		this.sketch = sketch;
		this.coreUtils = new CoreUtils();
	}

	loadExample = async (exampleId: string) => {
		this.clearAllData();
		const selectedExample = examples[exampleId];
		if (selectedExample) {
			const { files, videoId } = selectedExample;
			for (const file of files) {
				await this.loadLocalExampleDataFile(`/data/${exampleId}/`, file);
			}
			if (videoId) {
				loadVideo({ type: 'youtube', videoId });
			}
		}
	};

	testFileTypeForProcessing(file: File) {
		const fileName = file ? file.name.toLowerCase() : '';
		if (fileName.endsWith('.csv') || file.type === 'text/csv') {
			this.clearTranscriptData();
			this.loadCSVData(file);
		} else if (fileName.endsWith('.txt')) {
			this.clearTranscriptData();
			this.loadP5Strings(URL.createObjectURL(file));
		} else if (fileName.endsWith('.mp4') || file.type === 'video/mp4') {
			resetVideo();
			this.prepVideoFromFile(URL.createObjectURL(file));
		} else notifications.error('Unsupported file format. Please use CSV, TXT, or MP4 files.');
	}

	loadP5Strings(filePath) {
		this.sketch.loadStrings(
			filePath,
			(stringArray) => {
				if (!stringArray || stringArray.length === 0) {
					notifications.error('The text file is empty or could not be read.');
					return;
				}
				this.processData(stringArray, 'txt');
				this.updateAllDataValues();
			},
			(error) => {
				notifications.error('Error loading text file. Please check the file format.');
				console.error('File Load Error:', error);
			}
		);
	}

	loadCSVData = async (file: File) => {
		Papa.parse(file, {
			dynamicTyping: true,
			skipEmptyLines: 'greedy',
			header: true,
			transformHeader: (h) => {
				return h.trim().toLowerCase();
			},
			complete: (results: any, file: any) => {
				if (this.coreUtils.testTranscript(results)) {
					this.processData(results.data, 'csv');
					this.updateAllDataValues();
				} else {
					notifications.error(
						'Invalid CSV format. Required columns: "speaker" and "content". Optional: "start" and "end" for timing.'
					);
				}
			},
			error: (error, file) => {
				notifications.error('CSV parsing error. Please check the file format.');
				console.error('CSV parsing error:', error, file);
			}
		});
	};

	updateAllDataValues() {
		const enableRepeatedWordsThreshold = 5000;
		this.updateTimelineValues(transcript.totalTimeInSeconds);
		ConfigStore.update((currentConfig) => ({
			...currentConfig,
			repeatedWordsToggle: transcript.totalNumOfWords > enableRepeatedWordsThreshold
		}));
		this.sketch.fillAllData();
	}

	async loadLocalExampleDataFile(folder: string, fileName: string) {
		try {
			const response = await fetch(folder + fileName);
			const buffer = await response.arrayBuffer();
			const file = new File([buffer], fileName, {
				type: 'text/csv'
			});
			this.loadCSVData(file);
		} catch (error) {
			notifications.error('Error loading example file. Please check your internet connection.');
			console.error('Example file load error:', error);
		}
	}

	/**
	 * @param  {MP4 File} input
	 */
	prepVideoFromFile(fileLocation) {
		loadVideo({ type: 'file', fileUrl: fileLocation });
	}

	processData(dataArray: unknown[], type: 'csv' | 'txt') {
		if (!Array.isArray(dataArray) || dataArray.length === 0) {
			console.warn('No valid data to process.');
			return;
		}

		TranscriptStore.update((currentTranscript) => {
			const updatedTranscript = { ...currentTranscript };
			let turnNumber = 0;
			const wordArray: DataPoint[] = [];

			let lastValidStartTime: number | null = null;
			let lastValidEndTime: number | null = null;
			// Track timing mode: untimed, startOnly, or startEnd
			let hasAnyStartTime = false;
			let hasAnyEndTime = false;

			dataArray.forEach((data, i) => {
				let parsedData;
				if (type === 'txt') parsedData = this.parseDataLineTxt(data, updatedTranscript.totalNumOfWords);
				else {
					parsedData = this.parseDataRowCSV(data, dataArray[i + 1] ?? null, updatedTranscript.totalNumOfWords, lastValidStartTime, lastValidEndTime);
				}

				if (!parsedData) {
					console.warn(`Skipping malformed line at index ${i}:`, data);
					return;
				}

				const { speakerName, content, startTime, endTime, hasStartTime, hasEndTime } = parsedData;
				// Track if any row has start or end time data
				if (hasStartTime) hasAnyStartTime = true;
				if (hasEndTime) hasAnyEndTime = true;
				// Update last valid timestamps for efficient CSV processing
				lastValidStartTime = startTime;
				lastValidEndTime = endTime;

				// Update transcript values
				updatedTranscript.largestTurnLength = Math.max(updatedTranscript.largestTurnLength, content.length);
				updatedTranscript.totalTimeInSeconds = Math.max(updatedTranscript.totalTimeInSeconds, endTime);

				// Add words to wordArray
				content.forEach((word) => {
					wordArray.push(new DataPoint(speakerName, turnNumber, word, startTime, endTime));
					updatedTranscript.totalNumOfWords++;
				});

				turnNumber++;
			});

			updatedTranscript.wordArray = wordArray;
			updatedTranscript.totalConversationTurns = turnNumber;
			// Determine timing mode based on what was found in the data
			let timingMode: TimingMode = 'untimed';
			if (hasAnyStartTime && hasAnyEndTime) {
				timingMode = 'startEnd';
			} else if (hasAnyStartTime) {
				timingMode = 'startOnly';
			}
			updatedTranscript.timingMode = timingMode;
			Object.assign(updatedTranscript, this.setAdditionalDataValues(wordArray));
			return updatedTranscript;
		});
	}

	// Parses a single line from a TXT file
	parseDataLineTxt(line: unknown, currentWordCount: number) {
		if (typeof line !== 'string' || !line.trim()) return null;
		const content = this.createTurnContentArray(line.trim());
		if (!content.length) return null;
		const speakerName = content.shift()?.trim()?.toUpperCase() || '';
		if (!speakerName || !content.length) return null;
		this.updateUsers(speakerName);
		return {
			speakerName,
			content,
			startTime: currentWordCount,
			endTime: currentWordCount + content.length,
			hasStartTime: false,
			hasEndTime: false
		};
	}

	parseDataRowCSV(line: unknown, nextLine: unknown, currentWordCount: number, lastValidStartTime: number | null, lastValidEndTime: number | null) {
		if (!this.coreUtils.hasSpeakerNameAndContent(line)) return null;
		const headers = this.coreUtils.headersTranscriptWithTime;
		const speakerName = String(line[headers[0]]).trim().toUpperCase();
		this.updateUsers(speakerName);
		const content: string[] = this.createTurnContentArray(String(line[headers[1]]).trim());
		if (!content.length) return null;
		const curLineStartTime = TimeUtils.toSeconds(line[headers[2]]);
		const curLineEndTime = TimeUtils.toSeconds(line[headers[3]]);
		const hasStartTime = curLineStartTime !== null;
		const hasEndTime = curLineEndTime !== null;

		// For untimed transcripts, use word positions
		if (!hasStartTime && !hasEndTime) {
			return {
				speakerName,
				content,
				startTime: currentWordCount,
				endTime: currentWordCount + content.length,
				hasStartTime: false,
				hasEndTime: false
			};
		}

		// For timed transcripts, use actual timestamps with smart end time inference
		const startTime = curLineStartTime ?? lastValidEndTime ?? lastValidStartTime ?? 0;
		const nextLineStartTime = nextLine ? TimeUtils.toSeconds(nextLine[headers[2]]) : null;

		// End time inference priority:
		// 1. Use provided end time if available
		// 2. Use next line's start time if it's after current start
		// 3. Estimate based on word count (~3 words/sec speaking rate, minimum 1 second)
		const estimatedDuration = Math.max(1, content.length / 3);
		let endTime: number;
		if (curLineEndTime !== null) {
			endTime = curLineEndTime;
		} else if (nextLineStartTime !== null && nextLineStartTime > startTime) {
			endTime = nextLineStartTime;
		} else {
			endTime = startTime + estimatedDuration;
		}

		// Ensure end time is always after start time (minimum 1 second)
		if (endTime <= startTime) {
			endTime = startTime + Math.max(1, estimatedDuration);
		}

		return {
			speakerName,
			content,
			startTime,
			endTime,
			hasStartTime,
			hasEndTime
		};
	}

	setAdditionalDataValues(arr: DataPoint[]): [number, number, number, string] {
		const speakerWordCounts = new Map<string, number>(); // Map: speaker -> word count
		const speakerTurnCounts = new Map<string, Set<number>>(); // Map: speaker -> Set of turn numbers (unique)
		const wordFrequency = new Map<string, number>(); // Map: word -> frequency
		let maxWordFrequency = 0;
		let mostFrequentWord = '';
		arr.forEach(({ speaker, turnNumber, word }) => {
			// Track word count for each speaker
			speakerWordCounts.set(speaker, (speakerWordCounts.get(speaker) || 0) + 1);
			// Track unique turns per speaker (turnNumber should be unique for each speaker)
			if (!speakerTurnCounts.has(speaker)) {
				speakerTurnCounts.set(speaker, new Set());
			}
			speakerTurnCounts.get(speaker)?.add(turnNumber);
			// Track word frequency
			if (word) {
				wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
				const currentCount = wordFrequency.get(word) || 0;
				if (currentCount > maxWordFrequency) {
					maxWordFrequency = currentCount;
					mostFrequentWord = word;
				}
			}
		});

		return {
			largestNumOfWordsByASpeaker: Math.max(...Array.from(speakerWordCounts.values())), // largest number of words by a speaker
			largestNumOfTurnsByASpeaker: Math.max(...Array.from(speakerTurnCounts.values()).map((turnSet) => turnSet.size)), // largest number of turns by a speaker
			maxCountOfMostRepeatedWord: maxWordFrequency, // max count of the most repeated word
			mostFrequentWord
		};
	}

	updateUsers(userName: string) {
		UserStore.update((currentUsers) => {
			// If user doesn't exist, add a new one and return a new array
			if (!currentUsers.some((user) => user.name === userName)) {
				return [...currentUsers, this.createNewUser(currentUsers, userName)];
			}
			return currentUsers; // Return unchanged if user already exists
		});
	}

	createTurnContentArray(row) {
		return row.split(/\s+|[,?.!:;]+/).filter(Boolean);
	}

	createNewUser(users: User[], userName: string) {
		const availableColors = USER_COLORS.filter((color) => !users.some((u) => u.color === color));
		const userColor = availableColors.length > 0 ? availableColors[0] : '#000000'; // Default to black if no more unique colors available
		return new User(userColor, true, userName);
	}

	updateTimelineValues = (endTime: number) => {
		TimelineStore.update((timeline) => {
			timeline.setCurrTime(0);
			timeline.setStartTime(0);
			timeline.setEndTime(endTime);
			timeline.setLeftMarker(0);
			timeline.setRightMarker(endTime);
			return timeline;
		});
	};

	clearAllData() {
		this.sketch.dynamicData.clear();
		UserStore.set([]);
		TranscriptStore.set(new Transcript());
		// Reset video state
		resetVideo();
	}

	clearTranscriptData() {
		this.sketch.dynamicData.clear();
		UserStore.set([]);
		TranscriptStore.set(new Transcript());
	}
}
