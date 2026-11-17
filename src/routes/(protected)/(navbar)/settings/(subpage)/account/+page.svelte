<script lang="ts">
	import { page } from "$app/state";
	import CaretRightIcon from "phosphor-svelte/lib/CaretRightIcon";
	import { toast } from "svelte-sonner";

	import ToastUnimplemented from "#lib/components/feedback/ToastUnimplemented.svelte";
	import * as Item from "#lib/components/ui/item/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import { RovingFocusState } from "#lib/util/roving-focus-state.svelte.ts";

	const ROW_KEYS = [
		"privacy",
		"email",
		"password",
		"blocked",
		"hidden",
		"deleteAccount",
	];

	const rows = new RovingFocusState({
		keys: () => ROW_KEYS,
		orientation: "both",
		openerScope: page.url.pathname,
	});
</script>

{#snippet item({ key, title }: { key: string; title: string })}
	<Item.Root variant="outline">
		{#snippet child({ props })}
			<a
				href="#/"
				{...props}
				onclick={(event) => {
					event.preventDefault();
					toast(ToastUnimplemented, {
						componentProps: {
							message: "settings.account.unimplemented",
							issue: 47,
						},
					});
				}}
				{@attach rows.item(key)}
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
{#snippet linkItem({
	key,
	title,
	href,
}: {
	key: string;
	title: string;
	href: string;
})}
	<Item.Root variant="outline">
		{#snippet child({ props })}
			<a {href} {...props} {@attach rows.item(key)}>
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
<div class="contents" {@attach rows.container}>
	{@render linkItem({
		key: "privacy",
		title: t("settings.subpage.titles.privacy"),
		href: "/settings/account/privacy",
	})}
	{@render item({ key: "email", title: t("settings.account.email") })}
	{@render item({ key: "password", title: t("settings.account.password") })}
	{@render linkItem({
		key: "blocked",
		title: t("settings.subpage.titles.blocked"),
		href: "/settings/account/blocked",
	})}
	{@render linkItem({
		key: "hidden",
		title: t("settings.subpage.titles.hidden"),
		href: "/settings/account/hidden",
	})}
	{@render item({
		key: "deleteAccount",
		title: t("settings.account.deleteAccount"),
	})}
</div>
