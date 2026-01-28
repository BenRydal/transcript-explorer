/**
 * File Upload Utilities
 */

export type FileStatus = 'pending' | 'processing' | 'done' | 'error';

export interface UploadedFile {
	name: string;
	type: string;
	status: FileStatus;
	error?: string;
}

const FILE_TYPE_LABELS: Record<string, string> = {
	csv: 'Transcript (CSV)',
	txt: 'Transcript (TXT)',
	mp4: 'Video (MP4)',
	srt: 'Subtitle (SRT)',
	vtt: 'Subtitle (VTT)'
};

function getExtension(fileName: string): string {
	return fileName.toLowerCase().split('.').pop() || '';
}

function getFileTypeLabel(fileName: string): string {
	return FILE_TYPE_LABELS[getExtension(fileName)] || 'Unknown';
}

function isValidFileType(fileName: string): boolean {
	return getExtension(fileName) in FILE_TYPE_LABELS;
}

/**
 * Filters a list of files to only include supported types.
 */
export function filterValidFiles(files: File[]): File[] {
	return files.filter((f) => isValidFileType(f.name));
}

/**
 * Creates initial upload file entries for tracking status.
 */
export function createUploadEntries(files: File[]): UploadedFile[] {
	return files.map((f) => ({
		name: f.name,
		type: getFileTypeLabel(f.name),
		status: 'pending' as const
	}));
}
