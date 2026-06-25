<script lang="ts">
	import { formatDistanceToNowStrict } from "date-fns";

	let {
		onlineUntil,
		seen,
		self = false,
	}: {
		onlineUntil: number | null;
		seen: number | null;
		self?: boolean;
	} = $props();
</script>

{#if self || (onlineUntil !== null && onlineUntil > Date.now())}
	<div class="flex items-center gap-1.5 whitespace-nowrap">
		<span class="bg-green-500 rounded-full size-2 inline-block ms-0.5 shrink-0">
		</span>
		Online now
	</div>
{:else if seen !== null}
	<span class="text-gray-500">
		Online {formatDistanceToNowStrict(seen, {
			addSuffix: true,
		})}
	</span>
{:else}
	<span class="text-gray-500">Offline</span>
{/if}
