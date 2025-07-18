/** @import { TreeNode } from './plugin-utils.js' */
/** @import { VFile } from 'vfile' */

import { getProperties } from './plugin-utils.js';

const isParagraphWithClass = node =>
	node.type === 'element' && node.tagName === 'p' && node.children[0]?.type === 'text' && node.children[0].value.startsWith('.');

/**
 * @returns {(tree: TreeNode, file: VFile) => void}
 */
export default function classPlugin() {
	/**
	 * @param {TreeNode} tree
	 * @param {VFile} file
	 */
	return function (tree, file) {
		for (let index = 0; index < tree.children.length; index++) {
			const element = tree.children[index];
			if (isParagraphWithClass(element)) {
				const text = element.children[0].value;
				const end = text.search(/\s/);
				element.properties = getProperties(text.slice(0, end));
				element.children[0].value = text.slice(end).trimStart();
			}
		}
	};
}
