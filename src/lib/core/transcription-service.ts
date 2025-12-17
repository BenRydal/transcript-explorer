/**
 * TranscriptionService - In-browser audio transcription using Whisper via transformers.js
 *
 * This service runs entirely in the browser - no data is sent to external servers.
 * It uses OpenAI's Whisper model compiled to run via WebAssembly/WebGPU.
 */

import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@xenova/transformers';

export interface TranscriptionSegment {
	text: string;
	start: number; // seconds
	end: number; // seconds
}

export interface TranscriptionResult {
	segments: TranscriptionSegment[];
}

export interface TranscriptionProgress {
	status: 'loading-model' | 'transcribing' | 'complete' | 'error';
	progress: number; // 0-100
	message: string;
}

type ProgressCallback = (progress: TranscriptionProgress) => void;

// Cache the pipeline so we don't reload the model each time
let cachedPipeline: AutomaticSpeechRecognitionPipeline | null = null;
let isLoadingPipeline = false;
let pipelineLoadPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

/**
 * Get or create the Whisper pipeline
 * Uses the 'tiny' model for faster loading and processing
 */
async function getWhisperPipeline(onProgress?: ProgressCallback): Promise<AutomaticSpeechRecognitionPipeline> {
	if (cachedPipeline) {
		return cachedPipeline;
	}

	if (isLoadingPipeline && pipelineLoadPromise) {
		return pipelineLoadPromise;
	}

	isLoadingPipeline = true;

	pipelineLoadPromise = pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
		progress_callback: (progress: any) => {
			if (onProgress && progress.status === 'progress') {
				const percent = Math.round((progress.loaded / progress.total) * 100);
				onProgress({
					status: 'loading-model',
					progress: percent,
					message: `Downloading model: ${percent}%`
				});
			}
		}
	});

	try {
		cachedPipeline = await pipelineLoadPromise;
		return cachedPipeline;
	} finally {
		isLoadingPipeline = false;
	}
}

/**
 * Extract audio from a video file and convert to the format Whisper expects
 */
async function extractAudioFromVideo(videoFile: File | Blob): Promise<Float32Array> {
	const audioContext = new AudioContext({ sampleRate: 16000 }); // Whisper expects 16kHz

	// Create a URL for the video file
	const videoUrl = URL.createObjectURL(videoFile);

	try {
		// Fetch the video as an ArrayBuffer
		const response = await fetch(videoUrl);
		const arrayBuffer = await response.arrayBuffer();

		// Decode the audio
		const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

		// Get the audio data as a Float32Array (mono, 16kHz)
		const audioData = audioBuffer.getChannelData(0);

		// If the audio is not 16kHz, we need to resample
		if (audioBuffer.sampleRate !== 16000) {
			return resampleAudio(audioData, audioBuffer.sampleRate, 16000);
		}

		return audioData;
	} finally {
		URL.revokeObjectURL(videoUrl);
		await audioContext.close();
	}
}

/**
 * Simple linear resampling
 */
function resampleAudio(audioData: Float32Array, fromSampleRate: number, toSampleRate: number): Float32Array {
	const ratio = fromSampleRate / toSampleRate;
	const newLength = Math.round(audioData.length / ratio);
	const result = new Float32Array(newLength);

	for (let i = 0; i < newLength; i++) {
		const srcIndex = i * ratio;
		const srcIndexFloor = Math.floor(srcIndex);
		const srcIndexCeil = Math.min(srcIndexFloor + 1, audioData.length - 1);
		const fraction = srcIndex - srcIndexFloor;

		// Linear interpolation
		result[i] = audioData[srcIndexFloor] * (1 - fraction) + audioData[srcIndexCeil] * fraction;
	}

	return result;
}

/**
 * Transcribe a video file using Whisper
 */
export async function transcribeVideo(
	videoFile: File | Blob,
	onProgress?: ProgressCallback
): Promise<TranscriptionResult> {
	try {
		// Step 1: Load the model
		onProgress?.({
			status: 'loading-model',
			progress: 0,
			message: 'Loading transcription model...'
		});

		const transcriber = await getWhisperPipeline(onProgress);

		// Step 2: Extract audio from video
		onProgress?.({
			status: 'transcribing',
			progress: 10,
			message: 'Extracting audio from video...'
		});

		const audioData = await extractAudioFromVideo(videoFile);

		// Step 3: Transcribe
		onProgress?.({
			status: 'transcribing',
			progress: 20,
			message: 'Transcribing audio...'
		});

		const result = await transcriber(audioData, {
			return_timestamps: 'word',
			chunk_length_s: 30,
			stride_length_s: 5
		});

		onProgress?.({
			status: 'transcribing',
			progress: 90,
			message: 'Processing results...'
		});

		// Step 4: Process results into segments (group words into sentences/turns)
		const segments = processTranscriptionResult(result);

		onProgress?.({
			status: 'complete',
			progress: 100,
			message: 'Transcription complete!'
		});

		return { segments };
	} catch (error) {
		onProgress?.({
			status: 'error',
			progress: 0,
			message: error instanceof Error ? error.message : 'Transcription failed'
		});
		throw error;
	}
}

/**
 * Process raw Whisper output into transcript segments
 * Groups words into sentence-like chunks based on pauses and punctuation
 */
function processTranscriptionResult(result: any): TranscriptionSegment[] {
	const segments: TranscriptionSegment[] = [];

	// Handle different output formats from Whisper
	if (result.chunks && Array.isArray(result.chunks)) {
		// Word-level timestamps
		let currentSegment: { words: string[]; start: number; end: number } | null = null;
		const PAUSE_THRESHOLD = 1.0; // seconds - start new segment after this pause

		for (const chunk of result.chunks) {
			const word = chunk.text?.trim();
			if (!word) continue;

			const start = chunk.timestamp?.[0] ?? 0;
			const end = chunk.timestamp?.[1] ?? start;

			if (!currentSegment) {
				currentSegment = { words: [word], start, end };
			} else {
				// Check if we should start a new segment
				const pauseDuration = start - currentSegment.end;
				const endsWithPunctuation = /[.!?]$/.test(currentSegment.words[currentSegment.words.length - 1]);

				if (pauseDuration > PAUSE_THRESHOLD || (endsWithPunctuation && pauseDuration > 0.3)) {
					// Save current segment and start new one
					segments.push({
						text: currentSegment.words.join(' ').trim(),
						start: currentSegment.start,
						end: currentSegment.end
					});
					currentSegment = { words: [word], start, end };
				} else {
					// Add to current segment
					currentSegment.words.push(word);
					currentSegment.end = end;
				}
			}
		}

		// Don't forget the last segment
		if (currentSegment && currentSegment.words.length > 0) {
			segments.push({
				text: currentSegment.words.join(' ').trim(),
				start: currentSegment.start,
				end: currentSegment.end
			});
		}
	}

	return segments;
}
