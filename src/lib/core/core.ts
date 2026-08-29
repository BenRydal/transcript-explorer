import type p5 from 'p5';

import UserStore from '../../stores/userStore';
import TranscriptStore from '../../stores/transcriptStore.js';
import { loadVideo, reset as resetVideo } from '../../stores/videoStore';
import { Transcript } from '../../models/transcript';
import HistoryStore from '../../stores/historyStore.js';
import CodeStore from '../../stores/codeStore';
import FiltersStore from '../../stores/filtersStore';

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
	},
	'claude-chat': { files: ['conversation.csv'], videoId: '' },
	'claude-tools': { files: ['conversation.csv'], videoId: '' },
	'claude-agent': { files: ['conversation.csv'], videoId: '' },
	'claude-multi-agent': { files: ['conversation.csv'], videoId: '' },
	'cs-chat': { files: ['conversation.csv'], videoId: '' },
	'cs-tools': { files: ['conversation.csv'], videoId: '' },
	'cs-agent': { files: ['conversation.csv'], videoId: '' },
	'cs-multi-agent': { files: ['conversation.csv'], videoId: '' },
	'cooking-chat': { files: ['conversation.csv'], videoId: '' },
	'cooking-tools': { files: ['conversation.csv'], videoId: '' },
	'cooking-agent': { files: ['conversation.csv'], videoId: '' },
	'cooking-multi-agent': { files: ['conversation.csv'], videoId: '' },
	'trip-chat': { files: ['conversation.csv'], videoId: '' },
	'trip-tools': { files: ['conversation.csv'], videoId: '' },
	'trip-agent': { files: ['conversation.csv'], videoId: '' },
	'trip-multi-agent': { files: ['conversation.csv'], videoId: '' },
	'web-design-chat': { files: ['conversation.csv'], videoId: '' },
	'web-design-tools': { files: ['conversation.csv'], videoId: '' },
	'web-design-multi-agent': { files: ['conversation.csv'], videoId: '' }
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
	 * Fetch an example file and return it as a File object. The MIME type is
	 * derived from the extension so downstream dispatch (which can branch on
	 * file.type) routes .jsonl/.json sessions to the interaction parser rather
	 * than the CSV path. Throws if fetch fails.
	 */
	async fetchExampleFile(exampleId: string, fileName: string): Promise<File> {
		const response = await fetch(`/data/${exampleId}/${fileName}`);
		if (!response.ok) {
			throw new Error(`Failed to fetch example file: ${response.statusText}`);
		}
		const buffer = await response.arrayBuffer();
		const lower = fileName.toLowerCase();
		const type = lower.endsWith('.jsonl') || lower.endsWith('.json') ? 'application/json' : lower.endsWith('.txt') ? 'text/plain' : 'text/csv';
		return new File([buffer], fileName, { type });
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
		CodeStore.set([]);
		FiltersStore.update((c) => ({ ...c, codeColorMode: false, showUncoded: true }));
	}
}
