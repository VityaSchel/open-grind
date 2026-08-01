<script lang="ts">
	import { formatDistanceStrict } from "date-fns";

	import { getNow } from "$lib/util/now";

	let {
		onlineUntil,
		seen,
		self = false,
	}: {
		onlineUntil: number | null;
		seen: number | null;
		self?: boolean;
	} = $props();

	const online = $derived(onlineUntil !== null && onlineUntil > getNow());
</script>

{#if self || online}
	<div class="flex items-center gap-1.5 whitespace-nowrap">
		<span class="ms-0.5 inline-block size-2 shrink-0 rounded-full bg-green-500">
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
