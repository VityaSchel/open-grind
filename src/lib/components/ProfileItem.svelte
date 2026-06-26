<script lang="ts">
	import DisplayName from "$lib/components/DisplayName.svelte";
	import OnlineDot from "$lib/components/OnlineDot.svelte";
	import * as Avatar from "$lib/components/ui/avatar";
	import * as Item from "$lib/components/ui/item";
	import UserAvatar from "$lib/components/UserAvatar.svelte";

	let {
		avatarMediaHash,
		title,
		onlineUntil = null,
		active,
		avatarLink,
		link,
		description,
		actions,
	}: {
		avatarMediaHash: string | null;
		title: string | null;
		onlineUntil?: number | null;
		active?: boolean;
		avatarLink?: string;
		link: string;
		description?: import("svelte").Snippet;
		actions?: import("svelte").Snippet;
	} = $props();
</script>

{#snippet avatar()}
	<Item.Media class="relative translate-y-0! rounded-2xl p-2">
		<Avatar.Root class="size-20 after:rounded-xl">
			<UserAvatar
				mediaHash={avatarMediaHash}
				class="size-20 rounded-xl bg-neutral-700 *:rounded-xl"
			/>
		</Avatar.Root>
	</Item.Media>
{/snippet}
{#snippet content()}
	<Item.Content class="min-w-0 flex-1">
		<Item.Title
			class={[
				"flex w-auto min-w-0 items-center gap-1 truncate",
				{
					"text-muted-foreground": !title,
				},
			]}
		>
			<OnlineDot {onlineUntil} />
			<DisplayName name={title} class="truncate" />
		</Item.Title>
		{@render description?.()}
	</Item.Content>
	{@render actions?.()}
{/snippet}
<Item.Root
	variant={active ? "muted" : "outline"}
	class="@container flex min-w-24 flex-nowrap items-stretch gap-0 p-0"
>
	{#if avatarLink}
		<a href={avatarLink} class="rounded-l-2xl @max-row:hidden">
			{@render avatar()}
		</a>
		<a
			href={link}
			class="content gap-0.5 rounded-r-2xl p-4 ps-2 @max-row:hidden!"
		>
			{@render content()}
		</a>
		<a href={link} class="min-w-24 rounded-2xl @row:hidden">
			{@render avatar()}
		</a>
	{:else}
		<a href={link} class="content gap-2.5 overflow-clip rounded-2xl pe-4">
			{@render avatar()}
			{@render content()}
		</a>
	{/if}
</Item.Root>

<style lang="postcss">
	@reference "$layout";

	.content {
		@apply flex min-w-0 flex-1 items-center self-stretch;
	}
</style>
