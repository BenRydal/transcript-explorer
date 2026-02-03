/**
 * VideoService - Stateless operations for video playback
 * Works with both YouTube IFrame API players and HTML5 video elements
 */

// YouTube player type (from IFrame API)
interface YTPlayer {
	playVideo(): void;
	pauseVideo(): void;
	seekTo(seconds: number, allowSeekAhead?: boolean): void;
	getCurrentTime(): number;
	getDuration(): number;
	mute(): void;
	unMute(): void;
	isMuted(): boolean;
	destroy(): void;
	getIframe(): HTMLIFrameElement | null;
}

// Union type for supported player types
export type VideoPlayer = YTPlayer | HTMLVideoElement;

let youtubeApiLoaded = false;
let youtubeApiLoading = false;
const youtubeApiCallbacks: (() => void)[] = [];

/**
 * Load YouTube IFrame API script dynamically
 */
export function loadYouTubeApi(): Promise<void> {
	return new Promise((resolve) => {
		if (youtubeApiLoaded) {
			resolve();
			return;
		}

		youtubeApiCallbacks.push(resolve);

		if (youtubeApiLoading) {
			return;
		}

		youtubeApiLoading = true;

		// Check if API is already available (script might be in HTML)
		if (typeof window !== 'undefined' && (window as any).YT && (window as any).YT.Player) {
			youtubeApiLoaded = true;
			youtubeApiCallbacks.forEach((cb) => cb());
			youtubeApiCallbacks.length = 0;
			return;
		}

		// Set up callback before loading script
		(window as any).onYouTubeIframeAPIReady = () => {
			youtubeApiLoaded = true;
			youtubeApiCallbacks.forEach((cb) => cb());
			youtubeApiCallbacks.length = 0;
		};

		// Load the script
		const script = document.createElement('script');
		script.src = 'https://www.youtube.com/iframe_api';
		script.async = true;
		document.head.appendChild(script);
	});
}

/**
 * Create a YouTube player in the specified container
 */
export function createYouTubePlayer(
	containerId: string,
	videoId: string,
	onReady: (player: YTPlayer, duration: number) => void,
	onError?: (error: any) => void
): void {
	loadYouTubeApi().then(() => {
		const YT = (window as any).YT;
		new YT.Player(containerId, {
			videoId,
			playerVars: {
				controls: 0,
				disablekb: 1,
				playsinline: 1,
				modestbranding: 1,
				rel: 0
			},
			events: {
				onReady: (event: any) => {
					const player = event.target as YTPlayer;
					const duration = player.getDuration();
					onReady(player, duration);
				},
				onError: (event: any) => {
					console.error('YouTube player error:', event.data);
					onError?.(event.data);
				}
			}
		});
	});
}

/**
 * Execute a player operation with YouTube readiness check and error handling.
 * Returns the fallback value if player is null, not ready, or throws.
 */
function withPlayer<T>(
	player: VideoPlayer,
	ytAction: (p: YTPlayer) => T,
	htmlAction: (p: HTMLVideoElement) => T,
	fallback: T
): T {
	if (!player) return fallback;
	try {
		if (isYouTubePlayer(player)) {
			if (!isYouTubePlayerReady(player)) return fallback;
			return ytAction(player);
		} else {
			return htmlAction(player);
		}
	} catch {
		return fallback;
	}
}

export function playVideo(player: VideoPlayer): void {
	withPlayer(player, (p) => p.playVideo(), (p) => p.play(), undefined);
}

export function pauseVideo(player: VideoPlayer): void {
	withPlayer(player, (p) => p.pauseVideo(), (p) => p.pause(), undefined);
}

export function seekTo(player: VideoPlayer, time: number): void {
	withPlayer(player, (p) => p.seekTo(time, true), (p) => { p.currentTime = time; }, undefined);
}

export function getCurrentTime(player: VideoPlayer): number {
	return withPlayer(player, (p) => p.getCurrentTime(), (p) => p.currentTime, 0);
}

export function getDuration(player: VideoPlayer): number {
	return withPlayer(player, (p) => p.getDuration(), (p) => p.duration, 0);
}

export function muteVideo(player: VideoPlayer): void {
	withPlayer(player, (p) => p.mute(), (p) => { p.muted = true; }, undefined);
}

export function unmuteVideo(player: VideoPlayer): void {
	withPlayer(player, (p) => p.unMute(), (p) => { p.muted = false; }, undefined);
}

export function setPlaybackRate(player: VideoPlayer, rate: number): void {
	withPlayer(player, (p) => (p as any).setPlaybackRate?.(rate), (p) => { p.playbackRate = rate; }, undefined);
}

export function destroyPlayer(player: VideoPlayer): void {
	if (!player) return;
	try {
		if (isYouTubePlayer(player)) player.destroy();
	} catch { /* player already destroyed */ }
}

/**
 * Type guard to check if player is YouTube player
 */
function isYouTubePlayer(player: VideoPlayer): player is YTPlayer {
	return typeof (player as YTPlayer).playVideo === 'function';
}

/**
 * Check if a YouTube player is still attached to the DOM and usable
 */
function isYouTubePlayerReady(player: YTPlayer): boolean {
	try {
		const iframe = player.getIframe();
		return iframe !== null && iframe.isConnected;
	} catch {
		return false;
	}
}

/**
 * Check if any player (YouTube or HTML5) is ready to receive commands
 */
export function isPlayerReady(player: VideoPlayer | null): boolean {
	if (!player) return false;
	try {
		if (isYouTubePlayer(player)) {
			return isYouTubePlayerReady(player);
		} else {
			// HTML5 video - check if it has a valid src and readyState
			return player.readyState >= 1;
		}
	} catch {
		return false;
	}
}
