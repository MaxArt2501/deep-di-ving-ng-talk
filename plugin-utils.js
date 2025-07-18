/**
 * @typedef {Object} Position
 * @property {number} line
 * @property {number} column
 * @property {number} [offset]
 */
/**
 * @typedef {Object} TreeNode
 * @property {string} type - The type of the tree node.
 * @property {string} [value] - The value of the tree node.
 * @property {string} [tagName] - The tag name of the tree node.
 * @property {{ start: Position, end: Position }} [position] - The position of the tree node.
 * @property {Record<string, unknown>} [properties] - The properties of the tree node.
 * @property {TreeNode[]} [children] - The children of the tree node.
 */

// Parsing currently doesn't support nested fragments
export const FRAGMENT_RE = /\{#(\d*(?:\.\d+)?)\{([\s\S]*?)(?<!\\)\}#\}/g;

const SELECTOR_RE = /\[ *([\w-]+)(?: *= *('[^']*'|"[^"]*"|[^\]\s]+))? *\]|\.([\w-]+)|#([\w-]+)/g;
export const getProperties = string => {
	let lastIndex = 0;
	const properties = {};
	for (const {
		0: { length },
		1: attribute,
		2: value,
		3: className,
		4: id,
		index
	} of string.matchAll(SELECTOR_RE)) {
		if (lastIndex < index) {
			console.error(`Incorrect slide properties at position ${index}: "${string}"`);
			return {};
		}
		if (attribute) {
			properties[attribute] = value ? value.replace(/^['"]|['"]$/g, '') : '';
		} else if (className) {
			properties.class = properties.class ? `${properties.class} ${className}` : className;
		} else if (id) {
			properties.id = id;
		}
		lastIndex = index + length;
	}
	if (lastIndex < string.length) {
		console.error(`Incorrect slide properties at position ${lastIndex}: "${string}"`);
		return {};
	}
	return properties;
};

export const serializeProperties = properties =>
	Object.entries(properties)
		.map(([key, value]) => ` ${key}${value ? `="${value}"` : ''}`)
		.join('');

/** @type {WeakMap<TreeNode, TreeNode>} */
const parentMap = new WeakMap();
export const getParent = node => parentMap.get(node) ?? null;

/**
 * Get the next sibling of a node.
 * @param {TreeNode} node
 */
export const getNextSibling = node => {
	const parent = getParent(node);
	if (!parent) return null;
	const index = parent.children.indexOf(node);
	return parent.children[index + 1] ?? null;
};

/**
 * Set the parent for a node and recursively set parents for its children.
 * @param {TreeNode} node
 * @param {TreeNode?} parent
 */
export const setDescendancy = (node, parent) => {
	if (parent) parentMap.set(node, parent);
	for (const child of node.children ?? []) {
		setDescendancy(child, node);
	}
};

/**
 * @param {TreeNode} root
 * @param {(node: TreeNode) => boolean} matcher
 * @returns {Generator<TreeNode>}
 */
export function* getAllNodes(matcher, root) {
	let node = root;
	while (node) {
		if (matcher(node)) yield node;
		let nextNode = node.children?.[0] ?? getNextSibling(node);
		if (!nextNode) {
			while (node && node !== root) {
				node = getParent(node);
				nextNode = getNextSibling(node);
				if (nextNode) break;
			}
			if (node === root) break;
		}
    node = nextNode;
	}
}

/** @param {TreeNode} node */
const textNodeMatcher = node => node.type === 'text';

export const getTextNodes = getAllNodes.bind(null, textNodeMatcher);

/**
 * @param {TreeNode} node
 * @param {keyof TreeNode} property
 * @param {number} index
 * @returns {TreeNode[]}
 */
export const splitProperty = (node, property, index) => {
	const { [property]: value, ...rest } = node;
	const parent = getParent(node);
	const valueParts = [value.slice(0, index), value.slice(index)].filter(valuePart => valuePart.length > 0);
	const nodes = valueParts.map(valuePart => ({
		...rest,
		[property]: valuePart
	}));
	if (parent) {
		const idx = parent.children.indexOf(node);
		parent.children.splice(idx, 1, ...nodes);
	}
	nodes.forEach(newNode => setDescendancy(newNode, parent));
	return nodes;
};

/**
 * @param {TreeNode} ancestor
 * @param {TreeNode} node
 */
export const includesNode = (ancestor, node) => {
	let current = node;
	while (current) {
		if (current === ancestor) return true;
		current = getParent(current);
	}
	return false;
};

/**
 * @param  {...TreeNode} nodes
 */
export const getCommonAncestor = (...nodes) => {
	const commonAncestor = nodes.reduce((ancestor, node) => {
		while (ancestor && !includesNode(ancestor, node)) {
			ancestor = getParent(ancestor);
		}
		return ancestor;
	});
	return commonAncestor;
};

/**
 * @param {TreeNode} wrapper
 * @param  {...TreeNode} children
 */
export const wrapNodes = (wrapper, ...children) => {
	const parent = getParent(children[children.length - 1]);
	if (children.some(node => !parent.children.includes(node))) return null;

	wrapper.children = children;
	if (parent) {
		const index = parent.children.indexOf(children[0]);
		parent.children.splice(index, children.length, wrapper);
	}
	setDescendancy(wrapper, parent);

	children.forEach((child, index) => {
		child.parent = wrapper;
		if (index === children.length - 1) child.nextSibling = null;
	});
	return wrapper;
};

/**
 * @param {number} index
 * @param {Iterable<TreeNode>} textNodes
 * @returns {{text: TreeNode, index: number} | undefined}
 */
export const getTextNodeAtIndex = (index, textNodes) => {
	let prevLength = 0;
	for (const text of textNodes) {
		if (prevLength + text.value.length > index) {
			return { text, index: index - prevLength };
		}
		prevLength += text.value.length;
	}
};

/** @param {string} text */
export const getFragments = text => {
  const fragments = Array.from(text.matchAll(FRAGMENT_RE));
  let cleanedText = text;
  let indexShift = 0;
  for (const fragment of fragments) {
    fragment.index -= indexShift;
    const { 0: string, 2: content, index } = fragment;
    cleanedText = cleanedText.slice(0, index) + content + cleanedText.slice(index + string.length);
    indexShift += string.length - content.length;
  }
  return { cleanedText, fragments };
};
