import type p5 from 'p5';
import Papa from 'papaparse';
import { get } from 'svelte/store';

import { CoreUtils } from './core-utils.js';
import { DataPoint } from '../../models/dataPoint.js';
import { User } from '../../models/user.js';
import { USER_COLORS } from '../constants/index.js';

import UserStore from '../../stores/userStore';
import TimelineStore from '../../stores/timelineStore';
import TranscriptStore from '../../stores/transcriptStore.js';
import { Transcript } from '../../models/transcript';
import ConfigStore from '../../stores/configStore.js';

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

	handleExampleDropdown = async (event: any) => {
		this.clearAllData();
		const selectedValue = event.target.value;
		const selectedExample = examples[selectedValue];
		if (selectedExample) {
			const { files, videoId } = selectedExample;
			for (const file of files) {
				await this.loadLocalExampleDataFile(`/data/${selectedValue}/`, file);
			}
			if (videoId) {
				this.sketch.videoController.createVideoPlayer('Youtube', { videoId });
			}
		}
	};

	handleUserLoadedFiles = async (event: Event) => {
		const input = event.target as HTMLInputElement;
		for (let i = 0; i < input.files.length; i++) {
			const file = input.files ? input.files[i] : null;
			this.testFileTypeForProcessing(file);
		}
		input.value = ''; // reset input value so you can load same file(s) again in browser
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
			this.sketch.videoController.clear();
			this.prepVideoFromFile(URL.createObjectURL(file));
		} else alert('Error loading file. Please make sure your file is an accepted format'); // this should not be possible due to HTML5 accept for file inputs, but in case
	}

	loadP5Strings(filePath) {
		this.sketch.loadStrings(
			filePath,
			(stringArray) => {
				console.log('Text File Loaded');
				this.processData(stringArray, 'txt');
				this.updateAllDataValues();
			},
			(e) => {
				alert('Error loading text file. Please make sure it is correctly formatted.');
				console.log(e);
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
				console.log('Parsing complete:', results, file);
				if (this.coreUtils.testTranscript(results)) {
					this.processData(results.data, 'csv');
					this.updateAllDataValues();
				} else {
					alert(
						'Error loading CSV file. Please make sure your file is a CSV file formatted with correct column headers: speaker, content, start, end'
					);
				}
			},
			error: (error, file) => {
				alert('Parsing error with one of your CSV file. Please make sure your file is formatted correctly as a .CSV');
				console.log(error, file);
			}
		});
	};

	updateAllDataValues() {
		const transcript = get(TranscriptStore);
		this.updateTimelineValues(transcript.totalTimeInSeconds);
		ConfigStore.update((currentConfig) => {
			return { ...currentConfig, repeatWordSliderValue: transcript.maxCountOfMostRepeatedWord };
		});
		this.sketch.sketchController.fillAllData();
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
			alert('Error loading CSV file. Please make sure you have a good internet connection');
			console.log(error);
		}
	}

	/**
	 * @param  {MP4 File} input
	 */
	prepVideoFromFile(fileLocation) {
		this.sketch.videoController.createVideoPlayer('File', {
			fileName: fileLocation
		});
	}

	processData(dataArray: any, type: 'csv' | 'txt') {
		let turnNumber = 0;
		TranscriptStore.update((currentTranscript) => {
			const updatedTranscript = { ...currentTranscript };
			for (let i = 0; i < dataArray.length; i++) {
				const parsedData = this.parseDataLine(dataArray[i], type, updatedTranscript.totalNumOfWords, dataArray, i);
				if (!parsedData) continue;
				const { speakerName, content, speakerOrder, startTime, endTime } = parsedData;
				updatedTranscript.largestTurnLength = Math.max(updatedTranscript.largestTurnLength, content.length);
				updatedTranscript.totalTimeInSeconds = Math.max(updatedTranscript.totalTimeInSeconds, endTime);
				content.forEach((word) => {
					updatedTranscript.wordArray.push(new DataPoint(speakerName, turnNumber, word, speakerOrder, startTime, endTime));
					updatedTranscript.totalNumOfWords++;
				});
				turnNumber++;
			}
			updatedTranscript.totalConversationTurns = turnNumber;
			Object.assign(updatedTranscript, this.setAdditionalDataValues(updatedTranscript.wordArray));
			return updatedTranscript;
		});
	}

	parseDataLine(line: any, type: 'csv' | 'txt', currentWordCount: number, dataArray?: any[], rowIndex?: number) {
		if (type === 'csv') {
			if (!this.coreUtils.transcriptRowForType(line)) return null;
			const headers = this.coreUtils.headersTranscript;
			const speakerName = String(line[headers[0]]).trim().toUpperCase();
			this.updateUsers(speakerName);
			const content = this.createTurnContentArray(String(line[headers[1]]).trim());
			const speakerOrder = get(UserStore).findIndex((user) => user.name === speakerName);

			let startTime = parseFloat(line[headers[2]]);
			let endTime = parseFloat(line[headers[3]]);
			// Backward search for a missing startTime
			if (isNaN(startTime) && dataArray && rowIndex !== undefined) {
				for (let i = rowIndex - 1; i >= 0; i--) {
					const prevStart = parseFloat(dataArray[i][headers[2]]);
					if (!isNaN(prevStart)) {
						startTime = prevStart; // Use closest previous start time
						break;
					}
				}
			}
			if (isNaN(startTime)) startTime = currentWordCount; // Final fallback
			// Forward search for a missing endTime
			if (isNaN(endTime) && dataArray && rowIndex !== undefined) {
				for (let i = rowIndex + 1; i < dataArray.length; i++) {
					const nextStart = parseFloat(dataArray[i][headers[2]]);
					if (!isNaN(nextStart) && nextStart > startTime) {
						endTime = nextStart; // Use closest next start time
						break;
					}
				}
			}
			if (isNaN(endTime)) endTime = startTime + content.length; // Final fallback
			return { speakerName, content, speakerOrder, startTime, endTime };
		} else {
			if (!line) return null;
			const content = this.createTurnContentArray(line.trim());
			if (content.length === 0) return null;
			const speakerName = content.shift()?.trim()?.toUpperCase() || '';
			if (!speakerName) return null;
			this.updateUsers(speakerName);
			const speakerOrder = get(UserStore).findIndex((user) => user.name === speakerName);
			const startTime = currentWordCount;
			const endTime = currentWordCount + content.length;
			return { speakerName, content, speakerOrder, startTime, endTime };
		}
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
		console.log('Clearing all data');
		this.sketch.videoController.clear();
		this.sketch.dynamicData.clear();
		this.sketch.sketchController.scalingVars = this.sketch.sketchController.createScalingVars();
		UserStore.set([]);
		TranscriptStore.set(new Transcript());
		this.sketch.loop();
	}

	clearTranscriptData() {
		console.log('Clearing Transcript Data');
		this.sketch.dynamicData.clear();
		this.sketch.sketchController.scalingVars = this.sketch.sketchController.createScalingVars();
		UserStore.set([]);
		TranscriptStore.set(new Transcript());
		this.sketch.loop();
	}
}
