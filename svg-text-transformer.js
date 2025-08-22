/** @type {number} */
let lineCount;
/** @type {number[]} */
let lineLengths;
/** @type {number} */
let lineMaxLength;

const parseStyle = style =>
	Object.fromEntries(
		style
			.trim()
			.split(/\s*;\s*/)
			.filter(Boolean)
			.map(declaration => declaration.split(/\s*:\s*/))
	);

const withUnit = value => (isNaN(value) ? value : `${value}px`);

const whitespaceMap = {
	' ': 1,
	'\t': 2
};

/**
 * @typedef {Object} SvgTextTransformerOptions
 * @property {number | string} [x]
 * @property {number | string} [y]
 * @property {number | string} [dy]
 * @property {number | string} [paddingBlock]
 * @property {number | string} [paddingInline]
 * @property {string} [stroke]
 * @property {string} [strokeWidth]
 */

/**
 * @param {SvgTextTransformerOptions} options
 * @returns {import('shiki').ShikiTransformer}
 */
const transformerFactory = ({ x = 0, y = 0, dy = '1lh', paddingBlock = '0.5lh', paddingInline = '1ch', stroke = '#fff', strokeWidth = '0.2em', ...rootProps }) => ({
	preprocess(code) {
		const lines = code.split(/\r?\n/);
		lineCount = lines.length;
		lineLengths = lines.map(line => line.replaceAll('\t', '  ').length);
		lineMaxLength = Math.max(...lineLengths);
		return code;
	},
	pre(node) {
		node.tagName = 'g';
		const [codeNode] = node.children;
		const style = parseStyle(node.properties?.style ?? '');
		if (style['background-color']) {
			Object.assign(
				node.properties,
				{
					fill: style['background-color'],
					stroke,
					'stroke-width': strokeWidth,
				}
			);
			node.children.unshift({
				type: 'element',
				tagName: 'rect',
				properties: {
					width: `calc(${lineMaxLength}ch + ${withUnit(paddingInline)} * 2)`,
					height: `calc(${lineCount} * ${withUnit(dy)} + ${withUnit(paddingBlock)} * 2)`,
					x: `calc(${withUnit(x)} - ${withUnit(paddingInline)})`,
					y: `calc(${withUnit(y)} - ${withUnit(paddingBlock)})`,
					rx: '1ch'
				}
			});
		}
		if (style.color) {
			codeNode.properties.fill = style.color;
		}
		codeNode.properties.stroke = 'none';
		delete node.properties?.style;
		delete node.properties?.tabindex;
		node.properties = {
			...node.properties,
			...rootProps
		};
		return node;
	},
	code(node) {
		node.tagName = 'text';
		node.properties = { y, tabindex: '0' };
		return node;
	},
	line(node, index) {
		node.tagName = 'tspan';
		node.properties = {
			dy: index > 1 ? dy : undefined,
			x
		};
		return node;
	},
	span(node) {
		node.tagName = 'tspan';
		const style = parseStyle(node.properties?.style ?? '');
		node.children.forEach(child => {
			if (child.type === 'text') {
				child.value = child.value.replace(/^\s+/, whitespaces =>
					'\xA0'.repeat(Array.from(whitespaces).reduce((sum, char) => sum + (whitespaceMap[char] ?? 0), 0))
				);
			}
		});
		if (style.color) {
			node.properties = { fill: style.color };
		}
		return node;
	}
});

export default Object.assign(transformerFactory, transformerFactory({}));
