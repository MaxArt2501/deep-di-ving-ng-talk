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

/** @typedef {TreeNode & { type: 'text' }} TextNode */
/**
 * @typedef {Object} TextNodePointer
 * @property {TextNode} node
 * @property {number} index
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
 * @param {(node: TreeNode) => node is T} matcher
 * @returns {Generator<T>}
 * @template {TreeNode} T
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

/** @type {(node: TreeNode) => node is TextNode} */
const textNodeMatcher = node => node.type === 'text';

/** @type {(root: TreeNode) => Generator<TextNode>} */
export const getTextNodes = getAllNodes.bind(null, textNodeMatcher);

/**
 * @param {TreeNode} node
 * @param {keyof TreeNode} property
 * @param {number} index
 * @returns {TreeNode[]}
 */
export const splitProperty = (node, property, index) => {
	if (index === 0 || node[property].length === index) return [node];
	const { [property]: value, ...rest } = node;
	const parent = getParent(node);
	const otherNode = {
		...rest,
		[property]: value.slice(index)
	};
	node[property] = value.slice(0, index);
	insertBefore(parent, otherNode, getNextSibling(node));
	return [node, otherNode];
};

/**
 * @param {TextNode} node
 * @param {number} index
 */
export const splitText = (node, index) => splitProperty(node, 'value', index);

/**
 * @param {TreeNode} node
 * @param {number} index
 */
export const splitElement = (node, index) => splitProperty(node, 'children', index);

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
	return wrapper;
};

/**
 * @param {TreeNode} parent
 * @param {TreeNode} node
 * @param {TreeNode} [beforeNode]
 */
export const insertBefore = (parent, node, beforeNode) => {
	if (beforeNode) {
		const index = parent.children.indexOf(beforeNode);
		parent.children.splice(index, 0, node);
	} else {
		parent.children.push(node);
	}
	setDescendancy(node, parent);
};

/**
 * @param {number} index
 * @param {Iterable<TextNode>} textNodes
 * @param {boolean} [before]
 * @returns {TextNodePointer | undefined}
 */
export const getTextNodeAtIndex = (index, textNodes, before) => {
	let prevLength = 0;
	for (const node of textNodes) {
		if (prevLength + node.value.length > index - (before ? 1 : 0)) {
			return { node, index: index - prevLength };
		}
		prevLength += node.value.length;
	}
};

/**
 * @param {TreeNode} descendant
 * @param {TreeNode} ancestor
 * @param {boolean} [before]
 */
export const getAncestorChild = (descendant, ancestor, before) => {
	let child = descendant;
	while (getParent(child) !== ancestor) {
		const newAncestor = getParent(child);
		const splitIndex = newAncestor.children.indexOf(child) + (before ? 1 : 0);
		child = splitElement(newAncestor, splitIndex).at(before ? 0 : -1);
	}
	return child;
};

/**
 * @typedef {Object} FragmentBlock
 * @property {TextNodePointer} start
 * @property {TextNodePointer} end
 * @property {{ index?: string }} properties
 */
const FRAGMENT_BOUNDARY_RE = /(\{#(\d*(?:\.\d+)?(?:;[a-z][a-z-]*(?: +[a-z][a-z-]*)*)?|[a-zA-Z-]*)\{)|((?<!\\)\}#\})/gi;
/**
 * @param {TreeNode} root
 * @returns {Generator<FragmentBlock>}
 */
export function* generateFragments(root) {
	FRAGMENT_BOUNDARY_RE.lastIndex = 0;
	/** @type {RegExpExecArray[]} */
	const startStack = [];
	/** @type {RegExpExecArray} */
	let match;
	let textNodes = Array.from(getTextNodes(root));
	let fullText = textNodes.map(node => node.value).join('');
	// biome-ignore lint/suspicious/noAssignInExpressions: avoid verbosity
	while ((match = FRAGMENT_BOUNDARY_RE.exec(fullText))) {
		if (match?.[1]) {
			startStack.push(match);
		} else if (match?.[3] && startStack.length) {
			/** @type {RegExpExecArray} */
			const startMatch = startStack.pop();
			/** @type {TextNodePointer} */
			const start = getTextNodeAtIndex(startMatch.index, textNodes);
			/** @type {TextNodePointer} */
			const end = getTextNodeAtIndex(match.index + 3, textNodes, true);
			const properties = {};
			if (startMatch[2]) {
				const [index, effect] = startMatch[2].split(/\s*;\s*/);
				if (!effect) {
					properties[isNaN(index) ? 'effect' : 'index'] = index;
				} else {
					properties.index = index || undefined;
					properties.effect = effect || undefined;
				}
			}
			yield { start, end, properties };
			textNodes = Array.from(getTextNodes(root));
			const newFullText = textNodes.map(node => node.value).join('');
			if (startStack.length && newFullText !== fullText) {
				FRAGMENT_BOUNDARY_RE.lastIndex = startStack.at(-1).index + 1;
				fullText = newFullText;
			}
		}
	}
}
