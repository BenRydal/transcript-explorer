export type TooltipNode = { kind: 'text'; text: string } | { kind: 'b' | 'span'; style: string; children: TooltipNode[] };

const TAG = /<(\/?)(b|span)(?:\s+style="([^"]*)")?\s*>/gi;
const ALLOWED_PROPERTIES = new Set(['color', 'font-size', 'opacity']);
const SAFE_VALUE = /^[#\w\s.,%()+-]+$/;

function sanitizeStyle(style: string | undefined): string {
	if (!style) return '';
	return style
		.split(';')
		.map((declaration) => declaration.split(':'))
		.filter(([property, ...rest]) => {
			const value = rest.join(':').trim();
			return ALLOWED_PROPERTIES.has(property.trim().toLowerCase()) && SAFE_VALUE.test(value) && !/url\s*\(/i.test(value);
		})
		.map(([property, ...rest]) => `${property.trim()}: ${rest.join(':').trim()}`)
		.join('; ');
}

/** Parses the <b> and <span style> markup the visualizations emit; any other text, including other tags, stays literal. */
export function parseTooltipMarkup(content: string): TooltipNode[] {
	const root: TooltipNode[] = [];
	const open: { tag: 'b' | 'span'; children: TooltipNode[] }[] = [];
	const current = () => (open.length ? open[open.length - 1].children : root);
	const pushText = (text: string) => {
		if (text) current().push({ kind: 'text', text });
	};

	let last = 0;
	for (const match of content.matchAll(TAG)) {
		const [raw, closing, name, style] = match;
		const tag = name.toLowerCase() as 'b' | 'span';
		pushText(content.slice(last, match.index));
		last = match.index + raw.length;
		if (!closing) {
			const node: TooltipNode = { kind: tag, style: sanitizeStyle(style), children: [] };
			current().push(node);
			open.push({ tag, children: node.children });
		} else if (open.length && open[open.length - 1].tag === tag) {
			open.pop();
		} else {
			pushText(raw);
		}
	}
	pushText(content.slice(last));
	return root;
}
