/**
 * Extracts a YouTube video ID from a URL or direct ID.
 * Supports youtube.com, youtu.be, mobile, shorts, live, music, and embed URLs.
 */
export function extractYouTubeVideoId(input: string): string | null {
	const trimmed = input?.trim();
	if (!trimmed) return null;

	const isValidId = (id: string | null | undefined): id is string =>
		typeof id === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(id);

	if (isValidId(trimmed)) return trimmed;

	// Prepend https:// if no protocol (handles "youtube.com/..." without https://)
	const urlString = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

	try {
		const url = new URL(urlString);
		const host = url.hostname.replace(/^(www\.|m\.|music\.)/i, '');

		if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
			// /watch?v=ID
			if (url.pathname === '/watch') {
				const videoId = url.searchParams.get('v');
				if (isValidId(videoId)) return videoId;
			}
			// /embed/ID, /shorts/ID, /live/ID, /v/ID
			const pathMatch = url.pathname.match(/^\/(embed|shorts|live|v)\/([^/?]+)/);
			if (pathMatch && isValidId(pathMatch[2])) return pathMatch[2];
		}

		if (host === 'youtu.be') {
			const videoId = url.pathname.slice(1).split(/[?#]/)[0];
			if (isValidId(videoId)) return videoId;
		}
	} catch {
		// Not a valid URL
	}

	return null;
}
