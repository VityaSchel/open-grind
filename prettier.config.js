import { sveltekit } from "@opengrind/config/prettier/svelte";

const config = sveltekit({ tailwindStylesheet: "./src/layout.css" });

export default {
	...config,
	overrides: [
		...config.overrides,
		{
			files: "src/lib/i18n/**/*.json",
			options: { objectWrap: "preserve" },
		},
	],
};
