<script lang="ts">
	import { getNow, subscribeNow } from "$lib/util/now.svelte";
	import { formatTimeRelativeCustom } from "$lib/util/utils";

	let {
		date,
	}: {
		date: number;
	} = $props();

	$effect(() => subscribeNow());

	const relativeTime = $derived.by(() => {
		void getNow();
		return formatTimeRelativeCustom(date);
	});
</script>

{relativeTime}
