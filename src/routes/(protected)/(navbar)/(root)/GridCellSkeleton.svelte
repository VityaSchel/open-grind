<script lang="ts">
	import { observeIntersection } from "$lib/util/observe-intersection";

	let { onVisible }: { onVisible?: () => void } = $props();
</script>

<div
	class="aspect-square animate-pulse bg-stone-700"
	use:observeIntersection={{
		handle: onVisible,
		root: "scroller",
		rootMargin: "200px",
	}}
></div>
