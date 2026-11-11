<script lang="ts">
	import DisplayName from "#lib/components/profile/DisplayName.svelte";
	import ProfileStatusIndicator from "#lib/components/profile/ProfileStatusIndicator.svelte";
	import RightNowPostMeta from "#lib/components/right-now/RightNowPostMeta.svelte";
	import * as Card from "#lib/components/ui/card/index.ts";

	let {
		text,
		displayName,
		onlineUntil,
		posted,
		distance,
		hosting,
		centered = false,
	}: {
		text: string | null;
		displayName: string | null;
		onlineUntil: number | null;
		posted: number | null;
		distance?: number;
		hosting: boolean;
		centered?: boolean;
	} = $props();
</script>

{#snippet card()}
	<Card.Root
		data-slot="right-now-post-caption"
		class={[
			"max-w-md",
			{
				"pointer-events-auto w-full": centered,
				"mx-auto my-3 w-[calc(100%-1.5rem)]": !centered,
			},
		]}
	>
		<Card.Content class="flex flex-col gap-2">
			{#if text !== null}
				<p
					class="text-base wrap-break-word whitespace-pre-wrap select-text"
				>
					{text}
				</p>
			{/if}
			<div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
				<span
					class={[
						"flex min-w-0 items-center gap-1 font-medium",
						{ "text-muted-foreground": !displayName },
					]}
				>
					<ProfileStatusIndicator {onlineUntil} />
					<DisplayName name={displayName} class="truncate" />
				</span>
				<RightNowPostMeta {posted} {distance} {hosting} />
			</div>
		</Card.Content>
	</Card.Root>
{/snippet}

{#if centered}
	<div
		data-slot="right-now-post-caption-slide"
		class="grid size-full place-items-center p-4"
	>
		{@render card()}
	</div>
{:else}
	{@render card()}
{/if}
