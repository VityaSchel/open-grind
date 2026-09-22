<script lang="ts">
	import { afterNavigate } from "$app/navigation";
	import type { HTMLAnchorAttributes } from "svelte/elements";

	import { canGoBack } from "$lib/util/history";

	let {
		href,
		label = "Back",
		children,
		...rest
	}: Omit<HTMLAnchorAttributes, "href" | "onclick"> & {
		href: string;
		label?: string;
	} = $props();

	let leaving = false;

	afterNavigate(() => {
		leaving = false;
	});
</script>

<a
	{...rest}
	{href}
	aria-label={label}
	onclick={(event) => {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
			return;
		if (leaving) {
			event.preventDefault();
			return;
		}
		leaving = true;

		if (canGoBack()) {
			event.preventDefault();
			history.back();
		}
	}}
>
	{@render children?.()}
</a>
