<script lang="ts">
	import { formatTimeRelativeCustom } from "#lib/util/format-time.ts";
	import { getNow } from "#lib/util/now.ts";

	let { date }: { date: number } = $props();

	const relativeTime = $derived.by(() => {
		void getNow();
		return formatTimeRelativeCustom(date);
	});
</script>

{relativeTime}
