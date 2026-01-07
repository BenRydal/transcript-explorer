import { Duration } from 'luxon';

export class TimeUtils {
	/**
	 * Converts various time formats to seconds.
	 * Supported: HH:MM:SS, MM:SS, numeric seconds (with optional decimals, "." or "," separator)
	 * Returns null for empty/invalid input.
	 */
	static toSeconds(time: string | number | null | undefined): number | null {
		if (time == null || time === '') return null;

		// Numbers: validate and return
		if (typeof time === 'number') {
			return Number.isFinite(time) && time >= 0 ? time : null;
		}

		// Normalize: trim whitespace, convert comma to period for European decimals
		const normalized = time.trim().replace(',', '.');
		if (normalized === '') return null;

		// Try parsing as plain number (e.g., "90" or "90.5")
		const asNumber = Number(normalized);
		if (!isNaN(asNumber)) {
			return asNumber >= 0 ? asNumber : null;
		}

		// Try parsing as HH:MM:SS or MM:SS
		const parts = normalized.split(':');
		if (parts.length < 2 || parts.length > 3) return null;

		const nums = parts.map((p) => {
			const trimmed = p.trim();
			if (trimmed === '') return NaN;
			const n = Number(trimmed);
			return Number.isFinite(n) && n >= 0 ? n : NaN;
		});

		if (nums.some(isNaN)) return null;

		if (nums.length === 3) {
			const [hours, minutes, seconds] = nums;
			if (minutes >= 60 || seconds >= 60) return null;
			return hours * 3600 + minutes * 60 + seconds;
		} else {
			const [minutes, seconds] = nums;
			if (seconds >= 60) return null;
			return minutes * 60 + seconds;
		}
	}

	/** Formats seconds as HH:MM:SS */
	static formatTime(seconds: number): string {
		return Duration.fromObject({ seconds: Math.round(seconds) }).toFormat('hh:mm:ss');
	}

	/** Formats seconds as MM:SS (or HH:MM:SS if >= 1 hour) */
	static formatTimeAuto(seconds: number): string {
		const duration = Duration.fromObject({ seconds: Math.round(seconds) });
		return seconds < 3600 ? duration.toFormat('mm:ss') : duration.toFormat('hh:mm:ss');
	}

	/** Formats seconds compactly for video player: m:ss or h:mm:ss (no leading zeros) */
	static formatTimeCompact(seconds: number): string {
		if (!seconds || !Number.isFinite(seconds)) return '0:00';
		const duration = Duration.fromObject({ seconds: Math.floor(seconds) });
		return seconds < 3600 ? duration.toFormat('m:ss') : duration.toFormat('h:mm:ss');
	}
}
