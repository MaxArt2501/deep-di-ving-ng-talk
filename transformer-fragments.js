import { getCommonAncestor, getFragments, getParent, getTextNodeAtIndex, getTextNodes, setDescendancy, splitProperty, wrapNodes } from './plugin-utils.js';
/** @import { TreeNode } from './plugin-utils.js'; */

/** @type {RegExpExecArray[]} */
let fragments;

const splitText = (node, index) => splitProperty(node, 'value', index);
const splitElement = (node, index) => splitProperty(node, 'children', index);

/** @type {import('shiki').ShikiTransformer} */
export default {
	preprocess(code) {
		const result = getFragments(code);
		fragments = result.fragments;
		return result.cleanedText;
	},
	pre(root) {
		setDescendancy(root);
		for (const {
			index,
			1: fragmentIndex,
			2: { length }
		} of fragments) {
			const startRef = getTextNodeAtIndex(index, getTextNodes(root));
			if (!startRef) continue;
			const endRef = getTextNodeAtIndex(index + length - 1, getTextNodes(root));
			if (!endRef) continue;

			if (startRef.text === endRef.text) {
				const [beforeText] = splitText(startRef.text, endRef.index + 1);
				const [, text] = splitText(beforeText, startRef.index);
				if (!text) continue;
				const fragment = wrapNodes(
					{
						type: 'element',
						tagName: 'p-fragment'
					},
					text
				);
				if (fragmentIndex) fragment.properties = { index: fragmentIndex };
				continue;
			}

			const commonAncestor = getCommonAncestor(startRef.text, endRef.text);

			/** @type {TreeNode} */
			let startText;
			if (startRef.index > 0) {
				[, startText] = splitText(startRef.text, startRef.index);
			} else {
				startText = startRef.text;
			}

			let startAncestor = startText;
			while (getParent(startAncestor) !== commonAncestor) {
				const newAncestor = getParent(startAncestor);
				const splitIndex = newAncestor.children.indexOf(startAncestor);
				[, startAncestor] = splitElement(newAncestor, splitIndex);
			}

			/** @type {TreeNode} */
			let endText;
			if (endRef.index < endRef.text.value.length - 1) {
				[endText] = splitText(endRef.text, endRef.index);
			} else {
				endText = endRef.text;
			}

			let endAncestor = endText;
			while (getParent(endAncestor) !== commonAncestor) {
				const newAncestor = getParent(endAncestor);
				const splitIndex = newAncestor.children.indexOf(endAncestor) + 1;
				[endAncestor] = splitElement(newAncestor, splitIndex);
			}

			const toBeWrapped = commonAncestor.children.slice(
				commonAncestor.children.indexOf(startAncestor),
				commonAncestor.children.indexOf(endAncestor) + 1
			);
			const fragment = wrapNodes(
				{
					type: 'element',
					tagName: 'p-fragment'
				},
				...toBeWrapped
			);
			if (fragmentIndex) fragment.properties = { index: fragmentIndex };
		}
		return root;
	}
};
