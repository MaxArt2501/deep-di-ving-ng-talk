/** @import { TreeNode } from './plugin-utils.js' */
/** @import { VFile } from 'vfile' */

import { generateFragments, getAncestorChild, getCommonAncestor, setDescendancy, splitText, wrapNodes } from './plugin-utils.js';

/**
 * @returns {(tree: TreeNode, file: VFile) => void}
 */
export default function fragmentPlugin() {
	/**
	 * @param {TreeNode} tree
	 * @param {VFile} file
	 */
	return function (tree, file) {
		setDescendancy(tree);
		
		for (const { start, end, properties } of generateFragments(tree)) {
			/** @type {TreeNode[]} */
			let toBeWrapped;
			if (start.node === end.node) {
				const [beforeText] = splitText(start.node, end.index);
				const textNode = splitText(beforeText, start.index).at(-1);
				toBeWrapped = [textNode];
				textNode.value = textNode.value.slice(textNode.value.indexOf('{', 1) + 1, -3);
			} else {
				const commonAncestor = getCommonAncestor(start.node, end.node);
				const startTextNode = splitText(start.node, start.index).at(-1);
				const endTextNode = splitText(end.node, end.index)[0];
				startTextNode.value = startTextNode.value.slice(startTextNode.value.indexOf('{', 1) + 1);
				endTextNode.value = endTextNode.value.slice(0, -3);
				const startAncestor = getAncestorChild(startTextNode, commonAncestor);
				const endAncestor = getAncestorChild(endTextNode, commonAncestor, true);
				toBeWrapped = commonAncestor.children.slice(
					commonAncestor.children.indexOf(startAncestor),
					commonAncestor.children.indexOf(endAncestor) + 1
				);
			}
			wrapNodes(
				{
					type: 'element',
					tagName: 'p-fragment',
					properties
				},
				...toBeWrapped
			);
		}
	};
}
