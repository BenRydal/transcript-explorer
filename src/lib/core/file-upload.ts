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

const SUPPORTED_EXTENSIONS = ['csv', 'txt', 'mp4'] as const;

function getFileTypeLabel(fileName: string): string {
	const ext = fileName.toLowerCase().split('.').pop();
	switch (ext) {
		case 'csv':
			return 'Transcript (CSV)';
		case 'txt':
			return 'Transcript (TXT)';
		case 'mp4':
			return 'Video (MP4)';
		default:
			return 'Unknown';
	}
}

function isValidFileType(fileName: string): boolean {
	const ext = fileName.toLowerCase().split('.').pop();
	return SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number]);
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
