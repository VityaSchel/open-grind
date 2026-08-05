<script lang="ts">
	import { formatTimeRelativeCustom } from "$lib/util/format-time";
	import { getNow } from "$lib/util/now";

	let { date }: { date: number } = $props();

	const relativeTime = $derived.by(() => {
		void getNow();
		return formatTimeRelativeCustom(date);
	});
</script>

{relativeTime}
