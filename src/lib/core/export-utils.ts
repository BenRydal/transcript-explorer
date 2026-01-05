import Papa from 'papaparse';
import { get } from 'svelte/store';
import TranscriptStore from '../../stores/transcriptStore';
import { getTurnsFromWordArray } from './turn-utils';
import { TimeUtils } from './time-utils';
import { notifications } from '../../stores/notificationStore';

/**
 * Exports the current transcript to a CSV file and triggers download.
 * Columns vary by timing mode: untimed (speaker, content), startOnly (+start), startEnd (+end)
 */
export function exportTranscriptToCSV(): void {
	const transcript = get(TranscriptStore);

	if (!transcript.wordArray || transcript.wordArray.length === 0) {
		notifications.warning('No transcript data to export.');
		return;
	}

	const turns = getTurnsFromWordArray(transcript.wordArray);
	const { timingMode } = transcript;
	const includeStart = timingMode !== 'untimed';
	const includeEnd = timingMode === 'startEnd';

	const csvData = turns.map((turn) => ({
		speaker: turn.speaker,
		content: turn.words.join(' '),
		...(includeStart && { start: TimeUtils.formatTime(turn.startTime) }),
		...(includeEnd && { end: TimeUtils.formatTime(turn.endTime) })
	}));

	const columns = [
		'speaker',
		'content',
		...(includeStart ? ['start'] : []),
		...(includeEnd ? ['end'] : [])
	];

	const csv = Papa.unparse(csvData, { header: true, columns });
	const filename = generateFilename();
	downloadCSV(csv, filename);
	notifications.success('Transcript exported successfully.');
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
