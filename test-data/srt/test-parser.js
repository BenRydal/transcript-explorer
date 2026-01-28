// Quick test script for subtitle parser
// Run with: node test-files/test-parser.js

import { readFileSync } from 'fs';
import { parseSubtitleText } from '../src/lib/core/subtitle-parser.ts';

const testFiles = [
  'test-files/basic.srt',
  'test-files/basic.vtt',
  'test-files/multiline.srt',
  'test-files/styled.vtt',
  'test-files/hours.srt',
  'test-files/short-timestamps.vtt'
];

console.log('=== Subtitle Parser Tests ===\n');

for (const file of testFiles) {
  console.log(`\n--- ${file} ---`);
  try {
    const content = readFileSync(file, 'utf-8');
    const result = parseSubtitleText(content);

    console.log(`Turns: ${result.turns.length}`);
    console.log(`Has timestamps: ${result.hasTimestamps}`);
    console.log(`Format: ${result.detectedFormat}`);

    result.turns.forEach((turn, i) => {
      const start = turn.startTime?.toFixed(2) ?? 'null';
      const end = turn.endTime?.toFixed(2) ?? 'null';
      const preview = turn.content.length > 50 ? turn.content.slice(0, 50) + '...' : turn.content;
      console.log(`  ${i + 1}. [${start}s - ${end}s] "${preview}"`);
    });
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
  }
}
