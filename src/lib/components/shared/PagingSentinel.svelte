<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";

	import { observeIntersection } from "$lib/util/observe-intersection";
	import type { SentinelPaging } from "$lib/util/sentinel-paging.svelte";

	let {
		paging,
		...restProps
	}: { paging: SentinelPaging } & HTMLAttributes<HTMLDivElement> = $props();
</script>

{#key paging.armToken}
	<div
		{...restProps}
		use:observeIntersection={{
			handle: () => paging.run(),
			rootMargin: "400px",
		}}
	></div>
{/key}
