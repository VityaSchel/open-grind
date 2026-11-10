<script lang="ts">
	import DropIcon from "phosphor-svelte/lib/DropIcon";
	import HouseIcon from "phosphor-svelte/lib/HouseIcon";

	import type { RightNowStatus } from "#lib/model/right-now/index.ts";

	let { status }: { status: RightNowStatus } = $props();
</script>

{#if status !== "NOT_ACTIVE"}
	<span
		data-slot="profile-right-now-badge"
		class="flex items-center gap-1 whitespace-nowrap text-purple-500"
	>
		{#if status === "HOSTING"}
			<HouseIcon weight="fill" class="shrink-0" />
			Hosting
		{:else}
			<DropIcon weight="fill" class="shrink-0" />
			Right Now
		{/if}
	</span>
{/if}
