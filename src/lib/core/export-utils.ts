import Papa from 'papaparse';
import { get } from 'svelte/store';
import TranscriptStore from '../../stores/transcriptStore';
import { getTurnsFromWordArray } from './turn-utils';
import { TimeUtils } from './time-utils';

/**
 * Exports the current transcript to a CSV file and triggers download.
 */
export function exportTranscriptToCSV(): void {
	const transcript = get(TranscriptStore);

	if (!transcript.wordArray || transcript.wordArray.length === 0) {
		alert('No transcript data to export.');
		return;
	}

	const turns = getTurnsFromWordArray(transcript.wordArray);

	const csvData = turns.map((turn) => ({
		speaker: turn.speaker,
		content: turn.words.join(' '),
		start: formatTimeForExport(turn.startTime, turn.useWordCountsAsFallback),
		end: formatTimeForExport(turn.endTime, turn.useWordCountsAsFallback)
	}));

	const csv = Papa.unparse(csvData, {
		header: true,
		columns: ['speaker', 'content', 'start', 'end']
	});

	downloadCSV(csv, generateFilename());
}

/**
 * Formats a time value for export.
 * If using word counts as fallback, returns the raw number.
 * Otherwise returns HH:MM:SS format.
 */
function formatTimeForExport(seconds: number, useWordCountsAsFallback: boolean): string {
	if (useWordCountsAsFallback) {
		return String(seconds);
	}
	return TimeUtils.formatTime(seconds);
}

/**
 * Generates a filename for the exported CSV.
 */
function generateFilename(): string {
	const date = new Date();
	const dateStr = date.toISOString().split('T')[0];
	const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-');
	return `transcript-export-${dateStr}-${timeStr}.csv`;
}

/**
 * Triggers a download of the CSV content.
 */
function downloadCSV(csv: string, filename: string): void {
	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
	const link = document.createElement('a');
	const url = URL.createObjectURL(blob);

	link.setAttribute('href', url);
	link.setAttribute('download', filename);
	link.style.visibility = 'hidden';

	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);

	URL.revokeObjectURL(url);
}
