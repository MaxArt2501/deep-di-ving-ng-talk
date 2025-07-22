import {
	generateFragments,
	getAncestorChild,
	getCommonAncestor,
	getTextNodeAtIndex,
	getTextNodes,
	setDescendancy,
	splitText,
	wrapNodes
} from './plugin-utils.js';
/** @import { FragmentBlock, TreeNode } from './plugin-utils.js'; */

/** @type {FragmentBlock[]} */
let fragmentBlocks;

/** @type {import('shiki').ShikiTransformer} */
export default {
	preprocess(code) {
		let cleanedCode = code;
		fragmentBlocks = Array.from(generateFragments({ type: 'text', value: code }));
		const boundaries = fragmentBlocks.flatMap(({ start, end }) => [start, end]).sort((a, b) => a.index - b.index);
		for (let idx = boundaries.length - 1; idx >= 0; idx--) {
			const { index } = boundaries[idx];
			const isStart = code[index] === '{';
			const length = isStart ? code.indexOf('{', index + 1) + 1 - index : 3;
			cleanedCode = cleanedCode.slice(0, index - (isStart ? 0 : length)) + cleanedCode.slice(index + (isStart ? length : 0));
			for (let jdx = idx + (isStart ? 1 : 0); jdx < boundaries.length; jdx++) {
				boundaries[jdx].index -= length;
			}
		}
		return cleanedCode;
	},
	pre(root) {
		setDescendancy(root);
		for (const { start, end, properties } of fragmentBlocks) {
			const textNodes = Array.from(getTextNodes(root));
			const startRef = getTextNodeAtIndex(start.index, textNodes);
			if (!startRef) continue;
			const endRef = getTextNodeAtIndex(end.index, textNodes, true);
			if (!endRef) continue;

			/** @type {TreeNode[]} */
			let toBeWrapped;
			if (startRef.node === endRef.node) {
				const [beforeText] = splitText(startRef.node, endRef.index);
				toBeWrapped = [splitText(beforeText, startRef.index).at(-1)];
			} else {
				const commonAncestor = getCommonAncestor(startRef.node, endRef.node);
				const startAncestor = getAncestorChild(splitText(startRef.node, startRef.index).at(-1), commonAncestor);
				const endAncestor = getAncestorChild(splitText(endRef.node, endRef.index)[0], commonAncestor, true);
				toBeWrapped = commonAncestor.children.slice(
					commonAncestor.children.indexOf(startAncestor),
					commonAncestor.children.indexOf(endAncestor) + 1
				);
			}
			wrapNodes({
				type: 'element',
				tagName: 'p-fragment',
				properties
			}, ...toBeWrapped);
		}
		return root;
	}
};
