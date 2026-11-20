<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	import { observeIntersection } from "#lib/util/observe-intersection.ts";

	let {
		onVisible,
		...rest
	}: { onVisible?: () => void } & HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
	class="aspect-square animate-pulse bg-stone-700"
	use:observeIntersection={{ handle: onVisible, rootMargin: "200px" }}
	{...rest}
></div>
