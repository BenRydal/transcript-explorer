import type p5 from 'p5';

import UserStore from '../../stores/userStore';
import TranscriptStore from '../../stores/transcriptStore.js';
import { loadVideo, reset as resetVideo } from '../../stores/videoStore';
import { Transcript } from '../../models/transcript';
import HistoryStore from '../../stores/historyStore.js';

const examples: Record<string, { files: string[]; videoId: string }> = {
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

	constructor(sketch: p5) {
		this.sketch = sketch;
	}

	/**
	 * Get example metadata by ID.
	 */
	getExample(exampleId: string): { files: string[]; videoId: string } | null {
		return examples[exampleId] ?? null;
	}

	/**
	 * Fetch an example CSV file and return it as a File object.
	 * Throws if fetch fails.
	 */
	async fetchExampleFile(exampleId: string, fileName: string): Promise<File> {
		const response = await fetch(`/data/${exampleId}/${fileName}`);
		if (!response.ok) {
			throw new Error(`Failed to fetch example file: ${response.statusText}`);
		}
		const buffer = await response.arrayBuffer();
		return new File([buffer], fileName, { type: 'text/csv' });
	}

	/**
	 * Load video for an example.
	 */
	loadExampleVideo(videoId: string) {
		loadVideo({ type: 'youtube', videoId });
	}

	/**
	 * Reset video state.
	 */
	resetVideo() {
		resetVideo();
	}

	/**
	 * Load video from a local file URL.
	 */
	prepVideoFromFile(fileLocation: string) {
		loadVideo({ type: 'file', fileUrl: fileLocation });
	}

	/**
	 * Clear all transcript data and reset stores.
	 */
	clearTranscriptData() {
		this.sketch.dynamicData?.clear();
		UserStore.set([]);
		TranscriptStore.set(new Transcript());
		HistoryStore.clear();
	}
}
