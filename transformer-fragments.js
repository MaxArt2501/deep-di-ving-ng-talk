/** @type {RegExpExecArray[]} */
let fragments;

// Parsing currently doesn't support nested fragments
const fragmentRE = /\{#(\d*(?:\.\d+)?)\{([\s\S]*?)(?<!\\)\}#\}/g;

/** @typedef {{ parent: TreeNode | null, nextSibling: import('hast').ElementContent | null, children?: TreeNode[] }} BaseTreeNode */
/** @typedef {import('hast').Element & BaseTreeNode} TreeElement */
/** @typedef {import('hast').Comment & BaseTreeNode} TreeComment */
/** @typedef {import('hast').Text & BaseTreeNode} TreeText */
/** @typedef {TreeElement | TreeComment | TreeText} TreeNode */

/**
 * @param {import('hast').ElementContent} content
 * @returns {TreeNode}
 */
const buildTree = ({ children, ...rest }, parent = null) => {
	const node = {
		...structuredClone(rest),
		parent,
		nextSibling: null
	};

	if (children) {
		node.children = children.map(child => buildTree(child, node));
		node.children.forEach((child, index) => (child.nextSibling = node.children[index + 1] ?? null));
	}
	return node;
};

/**
 * @param {number} index
 * @param {Iterable<TreeText>} textNodes
 * @returns {{text: TreeText, index: number} | undefined}
 */
const getTextNodeAtIndex = (index, textNodes) => {
	let prevLength = 0;
	for (const text of textNodes) {
		if (prevLength + text.value.length > index) {
			return { text, index: index - prevLength };
		}
		prevLength += text.value.length;
	}
};

/**
 * @param {TreeText} text
 * @param {number} index
 * @returns {TreeText[]}
 */
const splitText = (text, index) => {
	const texts = [text.value.slice(0, index), text.value.slice(index)].filter(Boolean);
	const nodes = texts.map(value => ({
		type: 'text',
		value,
		parent: text.parent
	}));
	nodes.forEach((node, idx) => {
		node.nextSibling = idx < texts.length - 1 ? nodes[idx + 1] : text.nextSibling;
	});
	if (text.parent) {
		const idx = text.parent.children.indexOf(text);
		if (idx > 0) text.parent.children[idx - 1].nextSibling = nodes[0] ?? text.nextSibling;
		text.parent.children.splice(idx, 1, ...nodes);
	}
	return nodes;
};

/**
 * @param {TreeElement} node
 * @param {number} index
 * @returns {TreeElement[]}
 */
const splitElement = (node, index) => {
	const { children, parent, nextSibling, ...rest } = node;
	const childrenParts = [children.slice(0, index), children.slice(index)].filter(list => list.length > 0);
	const nodes = childrenParts.map(children => ({
		...rest,
		parent,
		children
	}));
	nodes.forEach((node, idx) => {
		node.nextSibling = idx < childrenParts.length - 1 ? nodes[idx + 1] : nextSibling;
		node.children.forEach(child => (child.parent = node));
	});
	if (parent) {
		const idx = parent.children.indexOf(node);
		if (idx > 0) parent.children[idx - 1].nextSibling = nodes[0] ?? nextSibling;
		parent.children.splice(idx, 1, ...nodes);
	}
	return nodes;
};

/**
 * @param {TreeElement} root
 * @returns {Generator<TreeText>}
 */
function* getTextNodes(root) {
	let node = root;
	while (node) {
		if (node.type === 'text') {
			yield node;
		}
		if (node.children?.length) {
			node = node.children[0];
		} else if (node.nextSibling) {
			node = node.nextSibling;
		} else {
			while (node && node !== root) {
				node = node.parent;
				if (node.nextSibling) {
					node = node.nextSibling;
					break;
				}
			}
			if (node === root) break;
		}
	}
}

/**
 * @param {TreeNode} ancestor
 * @param {TreeNode} node
 */
const includesNode = (ancestor, node) => {
	let current = node;
	while (current) {
		if (current === ancestor) return true;
		current = current.parent;
	}
	return false;
};

/**
 * @param  {...TreeNode} nodes
 */
const getCommonAncestor = (...nodes) => {
	const commonAncestor = nodes.reduce((ancestor, node) => {
		while (ancestor && !includesNode(ancestor, node)) {
			ancestor = ancestor.parent;
		}
		return ancestor;
	});
	return commonAncestor;
};

/**
 * @param {string} tagName
 * @param  {...TreeNode} children
 */
const wrapNodes = (tagName, ...children) => {
	const { parent, nextSibling } = children[children.length - 1];
	if (children.some((node, index) => node.parent !== parent || (index < children.length - 1 && node.nextSibling !== children[index + 1])))
		return null;

	/** @type {TreeElement} */
	const wrapper = {
		type: 'element',
		tagName,
		parent,
		nextSibling,
		children
	};
	if (parent) {
		const index = parent.children.indexOf(children[0]);
		if (index > 0) parent.children[index - 1].nextSibling = wrapper;
		parent.children.splice(index, children.length, wrapper);
	}
	children.forEach((child, index) => {
		child.parent = wrapper;
		if (index === children.length - 1) child.nextSibling = null;
	});
	return wrapper;
};

/** @type {import('shiki').ShikiTransformer} */
export default {
	preprocess(code) {
		fragments = Array.from(code.matchAll(fragmentRE));
		let cleanedCode = code;
		let indexShift = 0;
		for (const fragment of fragments) {
			fragment.index -= indexShift;
			const { 0: string, 2: content, index } = fragment;
			cleanedCode = cleanedCode.slice(0, index) + content + cleanedCode.slice(index + string.length);
			indexShift += string.length - content.length;
		}
		return cleanedCode;
	},
	pre(root) {
		let node = buildTree(root);
		for (const {
			index,
			1: fragmentIndex,
			2: { length }
		} of fragments) {
			const startRef = getTextNodeAtIndex(index, getTextNodes(node));
			if (!startRef) continue;
			const endRef = getTextNodeAtIndex(index + length - 1, getTextNodes(node));
			if (!endRef) continue;

			if (startRef.text === endRef.text) {
				const [beforeText] = splitText(startRef.text, endRef.index + 1);
				const [, text] = splitText(beforeText, startRef.index);
				if (!text) continue;
				const fragment = wrapNodes('p-fragment', text);
				if (fragmentIndex) fragment.properties = { index: fragmentIndex };
				continue;
			}

			const commonAncestor = getCommonAncestor(startRef.text, endRef.text);

			/** @type {TreeText} */
			let startText;
			if (startRef.index > 0) {
				[, startText] = splitText(startRef.text, startRef.index);
			} else {
				startText = startRef.text;
			}

			let startAncestor = startText;
			while (startAncestor.parent !== commonAncestor) {
				const newAncestor = startAncestor.parent;
				const splitIndex = newAncestor.children.indexOf(startAncestor);
				[, startAncestor] = splitElement(newAncestor, splitIndex);
			}

			/** @type {TreeText} */
			let endText;
			if (endRef.index < endRef.text.value.length - 1) {
				[endText] = splitText(endRef.text, endRef.index);
			} else {
				endText = endRef.text;
			}

			let endAncestor = endText;
			while (endAncestor.parent !== commonAncestor) {
				const newAncestor = endAncestor.parent;
				const splitIndex = newAncestor.children.indexOf(endAncestor) + 1;
				[endAncestor] = splitElement(newAncestor, splitIndex);
			}

			const toBeWrapped = commonAncestor.children.slice(
				commonAncestor.children.indexOf(startAncestor),
				commonAncestor.children.indexOf(endAncestor) + 1
			);
			const fragment = wrapNodes('p-fragment', ...toBeWrapped);
			if (fragmentIndex) fragment.properties = { index: fragmentIndex };
		}
		return node;
	}
};
