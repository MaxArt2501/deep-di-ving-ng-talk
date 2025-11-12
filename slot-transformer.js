/**
 * @param {Partial<TreeNode>} treeNodeBase 
 * @returns {import('shiki').ShikiTransformer}
 */
const transformerFactory = () => ({
	postprocess(html) {
		return this.options.meta?.__raw ? html.replace(/<\/[a-z]+>$/, end => this.options.meta.__raw + end) : html;
	}
});

export default transformerFactory();
