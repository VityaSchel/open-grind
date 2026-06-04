<script lang="ts">
	import DisplayName from "$lib/components/DisplayName.svelte";
	import * as Avatar from "$lib/components/ui/avatar";
	import * as Item from "$lib/components/ui/item";
	import UserAvatar from "$lib/components/UserAvatar.svelte";

	let {
		avatarMediaHash,
		title,
		active,
		avatarLink,
		link,
		description,
		actions,
	}: {
		avatarMediaHash: string | null;
		title: string | null;
		active?: boolean;
		avatarLink?: string;
		link: string;
		description?: import("svelte").Snippet;
		actions?: import("svelte").Snippet;
	} = $props();
</script>

{#snippet avatar()}
	<Item.Media class="p-2 translate-y-0! rounded-2xl relative">
		<Avatar.Root class="size-20 after:rounded-xl">
			<UserAvatar
				mediaHash={avatarMediaHash}
				class="rounded-xl bg-neutral-700 *:rounded-xl size-20"
			/>
		</Avatar.Root>
	</Item.Media>
{/snippet}
{#snippet content()}
	<Item.Content class="flex-1 min-w-0">
		<Item.Title
			class={[
				"truncate inline min-w-0 w-auto",
				{
					"text-muted-foreground": !title,
				},
			]}
		>
			<DisplayName name={title} />
		</Item.Title>
		{@render description?.()}
	</Item.Content>
	{@render actions?.()}
{/snippet}
<Item.Root
	variant={active ? "muted" : "outline"}
	class="p-0 gap-0 flex items-stretch flex-nowrap @container min-w-24"
>
	{#if avatarLink}
		<a href={avatarLink} class="rounded-l-2xl @max-[9rem]:hidden">
			{@render avatar()}
		</a>
		<a href={link} class="content gap-0.5 p-4 ps-2 rounded-r-2xl @max-[9rem]:hidden!">
			{@render content()}
		</a>
		<a href={link} class="rounded-2xl @[9rem]:hidden min-w-24">
			{@render avatar()}
		</a>
	{:else}
		<a href={link} class="content gap-2.5 pe-4 rounded-2xl">
			{@render avatar()}
			{@render content()}
		</a>
	{/if}
</Item.Root>

<style lang="postcss">
	@reference "$layout";

	.content {
		@apply flex flex-1 self-stretch items-center min-w-0 ;
	}
</style>
