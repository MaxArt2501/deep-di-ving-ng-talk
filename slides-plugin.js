/** @import { TreeNode } from './plugin-utils.js' */
/** @import { VFile } from 'vfile' */

import { getProperties, serializeProperties } from './plugin-utils.js';

const isSlideSeparator = node =>
	node.type === 'paragraph' && node.children[0]?.type === 'text' && node.children[0].value.startsWith('===');

/**
 * @returns {(tree: TreeNode, file: VFile) => void}
 */
export default function slidesPlugin() {
	/**
	 * @param {TreeNode} tree
	 * @param {VFile} file
	 */
	return function (tree, file) {
		let slideStart = -1;
		for (let index = 0; index < tree.children.length; index++) {
			const element = tree.children[index];
			if (isSlideSeparator(element)) {
				if (slideStart < 0 && index > 0) {
					tree.children.splice(0, 0, {
						type: 'html',
						value: '<p-slide>',
						position: {
							start: { line: 1, column: 1, offset: 0 },
							end: { line: 1, column: 1, offset: 0 }
						}
					});
					index++;
				}
				tree.children.splice(index, 1, {
					type: 'html',
					value: (index > 0 ? '</p-slide>\n' : '')
						+ `<p-slide${serializeProperties(getProperties(element.children[0].value.slice(3).trim()))}>`,
					position: element.position
				});

				slideStart = index;
			}
		}
		if (slideStart < tree.children.length) {
			tree.children.push({
				type: 'html',
				value: '</p-slide>',
				position: {
					start: { line: 1, column: 1, offset: 0 },
					end: { line: 1, column: 1, offset: 0 }
				}
			});
		}
	};
}
