<script lang="ts">
	import { CaretRightIcon } from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import ToastUnimplemented from "$lib/components/feedback/ToastUnimplemented.svelte";
	import * as Item from "$lib/components/ui/item";
</script>

{#snippet item({ title }: { title: string })}
	<Item.Root variant="outline">
		{#snippet child({ props })}
			<a
				href="#/"
				{...props}
				onclick={(event) => {
					event.preventDefault();
					toast(ToastUnimplemented, {
						componentProps: {
							feature: "Account settings",
							issue: 47,
						},
					});
				}}
			>
				<Item.Content class="max-cramped:min-w-0">
					<Item.Title
						class="inline-block max-w-full min-w-0 truncate"
					>
						{title}
					</Item.Title>
				</Item.Content>
				<Item.Actions class="min-w-0">
					<CaretRightIcon class="size-4 shrink-0" />
				</Item.Actions>
			</a>
		{/snippet}
	</Item.Root>
{/snippet}
{#snippet linkItem({ title, href }: { title: string; href: string })}
	<Item.Root variant="outline">
		{#snippet child({ props })}
			<a {href} {...props}>
				<Item.Content class="max-cramped:min-w-0">
					<Item.Title
						class="inline-block max-w-full min-w-0 truncate"
					>
						{title}
					</Item.Title>
				</Item.Content>
				<Item.Actions class="min-w-0">
					<CaretRightIcon class="size-4 shrink-0" />
				</Item.Actions>
			</a>
		{/snippet}
	</Item.Root>
{/snippet}
{@render linkItem({ title: "Privacy", href: "/settings/account/privacy" })}
{@render item({ title: "Email" })}
{@render item({ title: "Password" })}
{@render linkItem({
	title: "Blocked users",
	href: "/settings/account/blocked",
})}
{@render linkItem({ title: "Hidden users", href: "/settings/account/hidden" })}
{@render item({ title: "Delete account" })}
