import { DateTime, Duration } from 'luxon';

export class TimeUtils {
	/**
	 * Converts various time formats to seconds
	 * Supported formats:
	 * - HH:MM:SS
	 * - MM:SS
	 * - Seconds as number
	 * - Seconds as string
	 */
	static toSeconds(time: string | number): number {
		// If time is already a number, return it
		if (typeof time === 'number') {
			return time;
		}

		// If time is a string that can be directly converted to a number
		if (!isNaN(Number(time))) {
			return Number(time);
		}

		// Try to parse as HH:MM:SS or MM:SS
		const parts = time.split(':').map(Number);

		try {
			if (parts.length === 3) {
				// HH:MM:SS format
				return parts[0] * 3600 + parts[1] * 60 + parts[2];
			} else if (parts.length === 2) {
				// MM:SS format
				return parts[0] * 60 + parts[1];
			}
		} catch (error) {
			console.error('Error parsing time:', error);
			return 0;
		}

		// Default to 0 if format is not recognized
		return 0;
	}

	/**
	 * Formats seconds into HH:MM:SS
	 */
	static formatTime(seconds: number): string {
		const duration = Duration.fromObject({ seconds: Math.round(seconds) });
		return duration.toFormat('hh:mm:ss');
	}

	/**
	 * Formats seconds into MM:SS if under an hour, otherwise HH:MM:SS
	 */
	static formatTimeAuto(seconds: number): string {
		const duration = Duration.fromObject({ seconds: Math.round(seconds) });
		return seconds < 3600 ? duration.toFormat('mm:ss') : duration.toFormat('hh:mm:ss');
	}

	/**
	 * Validates if a string is in a valid time format
	 */
	static isValidTimeFormat(time: string): boolean {
		// Check HH:MM:SS format
		const hhmmssRegex = /^(?:(?:([01]?\d|2[0-3]):)?([0-5]?\d):)?([0-5]?\d)$/;
		return hhmmssRegex.test(time);
	}

	/**
	 * Parses a timestamp string and returns milliseconds
	 */
	static parseTimestamp(timestamp: string): number {
		const formats = ['HH:mm:ss', 'mm:ss', 'H:mm:ss', 'm:ss'];

		for (const format of formats) {
			const parsed = DateTime.fromFormat(timestamp, format);
			if (parsed.isValid) {
				const midnight = DateTime.fromObject({ hour: 0, minute: 0, second: 0 });
				return parsed.diff(midnight).as('seconds');
			}
		}

		throw new Error(`Invalid timestamp format: ${timestamp}`);
	}
}
