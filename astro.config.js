// @ts-check
import { defineConfig } from 'astro/config';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import classPlugin from './class-plugin.js';
import fragmentPlugin from './fragment-plugin.js';
import fragmentTransformer from './fragment-transformer.js';
import slidesPlugin from './slides-plugin.js';

// https://astro.build/config
export default defineConfig({
	vite: {
		plugins: [
			// @ts-ignore
			viteStaticCopy({
				targets: [
					{
						src: 'node_modules/p-slides/css/deck.css',
						dest: 'css'
					}
				]
			})
		]
	},
	markdown: {
		remarkPlugins: [
			slidesPlugin
		],
		rehypePlugins: [
			classPlugin, fragmentPlugin
		],
		shikiConfig: {
			transformers: [fragmentTransformer]
		}
	}
});
