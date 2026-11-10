<script lang="ts">
	import ClockIcon from "phosphor-svelte/lib/ClockIcon";
	import HouseIcon from "phosphor-svelte/lib/HouseIcon";

	import DistanceFormatted from "#lib/components/profile/DistanceFormatted.svelte";
	import RelativeTimeDynamic from "#lib/components/shared/RelativeTimeDynamic.svelte";

	let {
		posted,
		distance,
		hosting,
	}: { posted: number | null; distance?: number; hosting: boolean } =
		$props();
</script>

<div
	data-slot="right-now-post-meta"
	class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground"
>
	{#if posted !== null}
		<span class="flex items-center gap-1">
			<ClockIcon weight="fill" class="size-4" />
			<time datetime={new Date(posted).toISOString()}>
				<RelativeTimeDynamic date={posted} />
			</time>
		</span>
	{/if}
	{#if distance !== undefined}
		<span data-slot="right-now-post-distance">
			<DistanceFormatted {distance} />
		</span>
	{/if}
	{#if hosting}
		<span class="flex items-center">
			<HouseIcon weight="fill" class="size-4" />
			<span class="sr-only">Hosting</span>
		</span>
	{/if}
</div>
