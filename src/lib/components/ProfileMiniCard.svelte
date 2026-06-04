<script lang="ts">
	import type { Snippet } from "svelte";

	import DistanceFormatted from "$lib/components/DistanceFormatted.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import UserAvatar from "$lib/components/UserAvatar.svelte";

	let {
		mediaHash = null,
		displayName = null,
		age = null,
		distance = null,
		href = null,
		class: className,
		overlay,
	}: {
		mediaHash?: string | null;
		displayName?: string | null;
		age?: number | null;
		distance?: number | null;
		href?: string | null;
		class?: import("svelte/elements").ClassValue;
		overlay?: Snippet;
	} = $props();
</script>

{#snippet content()}
	<div class="absolute size-full bg-stone-700">
		<UserAvatar {mediaHash} class="size-full" size="xl" />
	</div>
	{#if distance !== null}
		<span class="absolute top-1 right-1.5 profile-card-distance">
			<DistanceFormatted {distance} />
		</span>
	{/if}
	{#if displayName !== null || age !== null}
		<div class="z-1 flex w-full gap-0.5 p-0.5">
			<Badge
				variant="outline"
				class="min-w-0 max-w-full shrink gap-0 bg-popover/20 backdrop-blur-2xl"
			>
				{#if displayName !== null}
					<span class="block shrink truncate font-semibold">{displayName}</span>
				{/if}
				{#if displayName !== null && age !== null}
					,&nbsp;
				{/if}
				{#if age !== null}
					<span class="line-clamp-1 block max-w-full shrink-0 truncate">
						{age}
					</span>
				{/if}
			</Badge>
		</div>
	{/if}
	{@render overlay?.()}
{/snippet}

{#if href !== null}
	<a
		{href}
		class={["relative flex aspect-square items-end overflow-hidden", className]}
	>
		{@render content()}
	</a>
{:else}
	<div
		class={["relative flex aspect-square items-end overflow-hidden", className]}
	>
		{@render content()}
	</div>
{/if}
