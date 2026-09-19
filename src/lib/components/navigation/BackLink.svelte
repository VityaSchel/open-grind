<script lang="ts">
	import { afterNavigate } from "$app/navigation";

	import { canGoBack } from "$lib/util/history";

	let {
		href,
		label = "Back",
		class: className,
		children,
	}: {
		href: string;
		label?: string;
		class?: import("svelte/elements").ClassValue;
		children?: import("svelte").Snippet;
	} = $props();

	let leaving = false;

	afterNavigate(() => {
		leaving = false;
	});
</script>

<a
	{href}
	aria-label={label}
	class={className}
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
