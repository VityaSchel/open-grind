<script lang="ts">
	import { openExternalLink } from "$lib/platform/link-opener";

	let {
		onclick,
		children,
		href,
		...props
	}: import("svelte/elements").SvelteHTMLElements["a"] = $props();
</script>

<a
	{href}
	onclick={(event) => {
		onclick?.(event);
		if (href) {
			event.preventDefault();
			openExternalLink(href);
		}
	}}
	{...props}
>
	{@render children?.()}
</a>
