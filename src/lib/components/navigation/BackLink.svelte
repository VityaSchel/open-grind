<script lang="ts">
	import { afterNavigate } from "$app/navigation";
	import { onMount } from "svelte";
	import { tinykeys } from "tinykeys";
	import type { HTMLAnchorAttributes } from "svelte/elements";

	import { runBackGestureHandlers } from "$lib/platform/back-gesture-event.svelte";
	import { canGoBack, returnTo } from "$lib/util/history";
	import { isPlainClick } from "$lib/util/plain-click";
	import { escapeMeansBack } from "./escape-back";

	let {
		href,
		label = "Back",
		children,
		...rest
	}: Omit<HTMLAnchorAttributes, "href" | "onclick"> & {
		href: string;
		label?: string;
	} = $props();

	let anchor = $state<HTMLAnchorElement | null>(null);
	let leaving = false;

	afterNavigate(() => {
		leaving = false;
	});

	onMount(() =>
		tinykeys(window, {
			Escape: (event) => {
				if (!escapeMeansBack(event)) return;
				event.preventDefault();
				if (!runBackGestureHandlers()) anchor?.click();
			},
		}),
	);
</script>

<a
	{...rest}
	bind:this={anchor}
	{href}
	aria-label={label}
	aria-keyshortcuts="Escape"
	onclick={(event) => {
		if (!isPlainClick(event)) return;
		event.preventDefault();
		if (leaving) return;
		leaving = true;

		if (canGoBack()) history.back();
		else returnTo(href);
	}}
>
	{@render children?.()}
</a>
