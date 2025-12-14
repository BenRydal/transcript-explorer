import { get } from 'svelte/store';
import UserStore from '../../stores/userStore';
import ConfigStore from '../../stores/configStore';
import { showTooltip } from '../../stores/tooltipStore';

// Layout constants
const BASE_SCALING = {
	minTextSize: 20,
	maxTextSize: 50,
	lineHeight: 50,
	newSpeakerGap: 75
};
const MIN_SCALE = 0.15;
const CHARS_PER_EM = 2;
const REFERENCE_TEXT_SIZE = 50;
const MAX_TOOLTIP_LENGTH = 300;

// Hover effect constants
const HOVER_SCALE = 1.15;
const HOVER_OUTLINE_WEIGHT = 2;

// Module-level caches
let scalingCache = { key: null, scaling: null };
const wordWidthCache = new Map();

function getScalingCacheKey(bounds, wordCount, config) {
	return `${bounds.x},${bounds.y},${bounds.width},${bounds.height}|${wordCount}|${config.separateToggle}|${config.repeatedWordsToggle}|${config.repeatWordSliderValue}|${config.dashboardToggle}`;
}

export class ContributionCloud {
	constructor(sk, bounds) {
		this.sk = sk;
		this.bounds = bounds;
		this.users = get(UserStore);
		this.config = get(ConfigStore);
		this.userMap = new Map(this.users.map(user => [user.name, user]));
	}

	getWordWidth(word, textSize) {
		if (!wordWidthCache.has(word)) {
			this.sk.textSize(REFERENCE_TEXT_SIZE);
			wordWidthCache.set(word, this.sk.textWidth(word) / REFERENCE_TEXT_SIZE);
		}
		return wordWidthCache.get(word) * textSize;
	}

	draw(words) {
		const layoutWords = words.filter(w => this.isWordLayoutVisible(w));
		const scaling = this.calculateScaling(layoutWords);
		const wordPositions = this.calculateWordPositions(layoutWords, scaling);

		if (this.config.separateToggle) {
			this.drawSpeakerBackgrounds(wordPositions, scaling);
		}

		const hoveredWord = this.findHoveredWord(wordPositions, scaling);

		for (const pos of wordPositions) {
			this.drawWord(pos, hoveredWord, scaling);
		}

		if (hoveredWord) {
			this.showWordTooltip(hoveredWord, wordPositions);
		}

		return { hoveredWord: hoveredWord?.word || null };
	}

	calculateWordPositions(words, scaling) {
		const positions = [];
		let x = this.bounds.x;
		let y = this.bounds.y + scaling.lineHeight;
		let prevSpeaker = null;

		for (const word of words) {
			const textSize = this.sk.map(word.count, 1, this.config.repeatWordSliderValue, scaling.minTextSize, scaling.maxTextSize, true);
			const width = this.getWordWidth(word.word, textSize);

			if (this.config.separateToggle && prevSpeaker !== null && word.speaker !== prevSpeaker) {
				x = this.bounds.x;
				y += scaling.newSpeakerGap;
			} else if (x + width > this.bounds.x + this.bounds.width) {
				x = this.bounds.x;
				y += scaling.lineHeight;
			}

			if (this.passesSearchFilter(word)) {
				positions.push({
					word,
					x,
					y,
					textSize,
					width,
					user: this.userMap.get(word.speaker),
					isNewSpeaker: prevSpeaker !== null && word.speaker !== prevSpeaker
				});
			}

			x += this.getWordWidth(word.word + ' ', textSize);
			prevSpeaker = word.speaker;
		}

		return positions;
	}

	findHoveredWord(positions, scaling) {
		for (const pos of positions) {
			if (pos.user?.enabled) {
				const boxHeight = scaling.lineHeight;
				if (this.sk.overRect(pos.x, pos.y - boxHeight, pos.width, boxHeight)) {
					return pos;
				}
			}
		}
		return null;
	}

	drawSpeakerBackgrounds(positions, scaling) {
		if (positions.length === 0) return;

		let sectionStart = 0;
		for (let i = 1; i <= positions.length; i++) {
			if (i === positions.length || positions[i].isNewSpeaker) {
				const section = positions.slice(sectionStart, i);
				const user = section[0]?.user;

				if (user?.enabled && user?.color) {
					const minY = Math.min(...section.map(w => w.y)) - scaling.lineHeight;
					const maxY = Math.max(...section.map(w => w.y));
					const c = this.sk.color(user.color);
					c.setAlpha(15);

					this.sk.noStroke();
					this.sk.fill(c);
					this.sk.rect(
						this.bounds.x - 5,
						minY,
						this.bounds.width + 10,
						maxY - minY + 10,
						5
					);
				}
				sectionStart = i;
			}
		}
	}

	drawWord(pos, hoveredPos, scaling) {
		const { word, x, y, textSize, width, user } = pos;
		const isHovered = hoveredPos?.word === word;
		const isSameWord = hoveredPos && word.word === hoveredPos.word.word && !isHovered;

		const displaySize = isHovered ? textSize * HOVER_SCALE : textSize;
		this.sk.textSize(displaySize);

		// Highlight other instances of the same word
		if (isSameWord) {
			this.sk.noFill();
			this.sk.stroke(user?.color || 200);
			this.sk.strokeWeight(1);
			this.sk.rect(x - 2, y - textSize - 2, width + 4, textSize + 4, 3);
		}

		// Highlight hovered word
		if (isHovered) {
			this.sk.noFill();
			this.sk.stroke(user?.color || 255);
			this.sk.strokeWeight(HOVER_OUTLINE_WEIGHT);
			this.sk.rect(x - 3, y - textSize - 3, width + 6, textSize + 6, 4);
		}

		// Draw the word text
		this.sk.noStroke();
		this.sk.fill(this.getWordColor(user, word));

		const drawX = isHovered ? x - (width * (HOVER_SCALE - 1)) / 2 : x;
		this.sk.text(word.word, drawX, y);
	}

	getWordColor(user, word) {
		if (!user?.enabled) return 255;

		const selectedWord = this.config.selectedWordFromContributionCloud;
		if (!selectedWord || word.word === selectedWord.word || word.turnNumber === selectedWord.turnNumber) {
			return user.color;
		}
		return 225;
	}

	showWordTooltip(pos, allPositions) {
		const { word, user } = pos;
		const turnContext = this.getTurnContext(word, allPositions);
		const totalCount = this.getTotalWordCount(word.word, allPositions);

		let content = `<b>${word.speaker}:</b> ${turnContext || word.word}`;

		const details = [`×${totalCount}`, `Turn ${word.turnNumber}`];
		if (!word.useWordCountsAsFallback) {
			const time = this.formatTime(word.startTime);
			if (time) details.push(time);
		}

		content += `\n<span style="font-size: 0.85em; opacity: 0.7">${details.join('  ·  ')}</span>`;

		showTooltip(this.sk.mouseX, this.sk.mouseY, content, user?.color || [200, 200, 200], this.sk.height);
	}

	getTurnContext(word, allPositions) {
		const turnWords = allPositions
			.filter(p => p.word.turnNumber === word.turnNumber)
			.sort((a, b) => a.word.order - b.word.order)
			.map(p => p.word.word);

		if (turnWords.length === 0) return null;

		const wordIndex = turnWords.findIndex(w => w === word.word);
		const parts = turnWords.map((w, i) => i === wordIndex ? `<b>${w}</b>` : w);

		let sentence = parts.join(' ');
		if (sentence.length > MAX_TOOLTIP_LENGTH && wordIndex >= 0) {
			const start = Math.max(0, wordIndex - 8);
			const end = Math.min(parts.length, wordIndex + 12);
			sentence = (start > 0 ? '... ' : '') + parts.slice(start, end).join(' ') + (end < parts.length ? ' ...' : '');
		}

		return sentence;
	}

	getTotalWordCount(wordText, allPositions) {
		const first = allPositions.find(p => p.word.word === wordText);
		return first?.word.count || 1;
	}

	formatTime(seconds) {
		if (seconds == null) return null;
		const hrs = Math.floor(seconds / 3600);
		const mins = Math.floor((seconds % 3600) / 60);
		const secs = Math.floor(seconds % 60);
		const pad = n => n.toString().padStart(2, '0');
		return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
	}

	calculateScaling(words) {
		if (words.length === 0) return { ...BASE_SCALING };

		const cacheKey = getScalingCacheKey(this.bounds, words.length, this.config);
		if (scalingCache.key === cacheKey && scalingCache.scaling) {
			return scalingCache.scaling;
		}

		const availableWidth = this.bounds.width;
		const availableHeight = this.bounds.height;

		let scaleFactor = this.estimateScaleFactor(words, availableWidth, availableHeight);
		let measuredHeight = this.measureHeight(words, scaleFactor, availableWidth);

		// Shrink if needed
		while (scaleFactor > MIN_SCALE && measuredHeight > availableHeight) {
			scaleFactor *= 0.9;
			measuredHeight = this.measureHeight(words, scaleFactor, availableWidth);
		}

		// Try to grow if there's room
		for (let i = 0; i < 5 && scaleFactor < 1.0; i++) {
			const larger = Math.min(scaleFactor * 1.1, 1.0);
			if (this.measureHeight(words, larger, availableWidth) <= availableHeight) {
				scaleFactor = larger;
			} else {
				break;
			}
		}

		const scaling = {
			minTextSize: BASE_SCALING.minTextSize * scaleFactor,
			maxTextSize: BASE_SCALING.maxTextSize * scaleFactor,
			lineHeight: BASE_SCALING.lineHeight * scaleFactor,
			newSpeakerGap: BASE_SCALING.newSpeakerGap * scaleFactor
		};

		scalingCache.key = cacheKey;
		scalingCache.scaling = scaling;
		return scaling;
	}

	estimateScaleFactor(words, availableWidth, availableHeight) {
		let totalChars = 0;
		let speakerChanges = 0;
		let prevSpeaker = null;

		for (const word of words) {
			totalChars += word.word.length + 1;
			if (this.config.separateToggle && prevSpeaker !== null && word.speaker !== prevSpeaker) {
				speakerChanges++;
			}
			prevSpeaker = word.speaker;
		}

		const charsPerLine = availableWidth / (BASE_SCALING.maxTextSize / CHARS_PER_EM);
		const totalLines = Math.ceil(totalChars / charsPerLine) + speakerChanges;
		const estimatedHeight = totalLines * BASE_SCALING.lineHeight +
			speakerChanges * (BASE_SCALING.newSpeakerGap - BASE_SCALING.lineHeight);

		if (estimatedHeight <= availableHeight) return 1.0;
		return Math.max(MIN_SCALE, Math.sqrt(availableHeight / estimatedHeight));
	}

	measureHeight(words, scaleFactor, availableWidth) {
		const lineHeight = BASE_SCALING.lineHeight * scaleFactor;
		const newSpeakerGap = BASE_SCALING.newSpeakerGap * scaleFactor;
		const minSize = BASE_SCALING.minTextSize * scaleFactor;
		const maxSize = BASE_SCALING.maxTextSize * scaleFactor;

		let x = 0;
		let height = lineHeight;
		let prevSpeaker = null;

		for (const word of words) {
			const textSize = this.sk.map(word.count, 1, this.config.repeatWordSliderValue, minSize, maxSize, true);
			const wordWidth = this.getWordWidth(word.word, textSize);

			if (this.config.separateToggle && prevSpeaker !== null && word.speaker !== prevSpeaker) {
				x = 0;
				height += newSpeakerGap;
			} else if (x + wordWidth > availableWidth) {
				x = 0;
				height += lineHeight;
			}

			x += this.getWordWidth(word.word + ' ', textSize);
			prevSpeaker = word.speaker;
		}

		return height;
	}

	isWordLayoutVisible(word) {
		if (this.config.dashboardToggle && !this.sk.shouldDraw(word, 'turnNumber', 'firstWordOfTurnSelectedInTurnChart')) {
			return false;
		}
		if (this.config.repeatedWordsToggle && word.count < this.config.repeatWordSliderValue) {
			return false;
		}
		return true;
	}

	passesSearchFilter(word) {
		if (!this.config.wordToSearch) return true;
		return word.word.toLowerCase().includes(this.config.wordToSearch.toLowerCase());
	}
}

export function clearScalingCache(clearWordWidths = false) {
	scalingCache.key = null;
	scalingCache.scaling = null;
	if (clearWordWidths) {
		wordWidthCache.clear();
	}
}
