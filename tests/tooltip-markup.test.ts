import { describe, expect, it } from 'vitest';
import { parseTooltipMarkup } from '../src/lib/core/tooltip-markup';

describe('parseTooltipMarkup', () => {
	it('returns plain text as one node', () => {
		expect(parseTooltipMarkup('hello\nworld')).toEqual([{ kind: 'text', text: 'hello\nworld' }]);
	});

	it('parses nested bold and styled spans', () => {
		expect(parseTooltipMarkup('<span style="color: #fff"><b>Ann</b> asks</span>')).toEqual([
			{
				kind: 'span',
				style: 'color: #fff',
				children: [
					{ kind: 'b', style: '', children: [{ kind: 'text', text: 'Ann' }] },
					{ kind: 'text', text: ' asks' }
				]
			}
		]);
	});

	it('keeps other tags literal instead of interpreting them', () => {
		expect(parseTooltipMarkup('<img src=x onerror=alert(1)> and <script>x</script>')).toEqual([
			{ kind: 'text', text: '<img src=x onerror=alert(1)> and <script>x</script>' }
		]);
	});

	it('drops style declarations outside the allow-list', () => {
		const [node] = parseTooltipMarkup('<span style="position: fixed; opacity: 0.6; color: url(x)">t</span>');
		expect(node).toMatchObject({ kind: 'span', style: 'opacity: 0.6' });
	});

	it('treats a stray closing tag as text and closes unclosed tags', () => {
		expect(parseTooltipMarkup('a</b><b>c')).toEqual([
			{ kind: 'text', text: 'a' },
			{ kind: 'text', text: '</b>' },
			{ kind: 'b', style: '', children: [{ kind: 'text', text: 'c' }] }
		]);
	});
});
