<script lang="ts">
	import { formatDistanceStrict } from "date-fns";

	import { getNow, subscribeNow } from "$lib/util/now.svelte";

	let {
		onlineUntil,
		seen,
		self = false,
	}: {
		onlineUntil: number | null;
		seen: number | null;
		self?: boolean;
	} = $props();

	$effect(() => subscribeNow());

	const online = $derived(onlineUntil !== null && onlineUntil > getNow());
</script>

{#if self || online}
	<div class="flex items-center gap-1.5 whitespace-nowrap">
		<span class="bg-green-500 rounded-full size-2 inline-block ms-0.5 shrink-0">
		</span>
		Online now
	</div>
{:else if seen !== null}
	<span class="text-gray-500">
		Online {formatDistanceStrict(seen, getNow(), {
			addSuffix: true,
		})}
	</span>
{:else}
	<span class="text-gray-500">Offline</span>
{/if}
