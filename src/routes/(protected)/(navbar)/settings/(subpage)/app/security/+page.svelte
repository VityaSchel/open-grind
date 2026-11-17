<script lang="ts">
	import { page } from "$app/state";
	import CaretRightIcon from "phosphor-svelte/lib/CaretRightIcon";
	import { toast } from "svelte-sonner";

	import ToastUnimplemented from "#lib/components/feedback/ToastUnimplemented.svelte";
	import * as Item from "#lib/components/ui/item/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import { disguiseAvailable } from "#lib/platform/disguise.svelte.ts";
	import { RovingFocusState } from "#lib/util/roving-focus-state.svelte.ts";
	import type { UnimplementedMessageKey } from "#lib/components/feedback/unimplemented.ts";

	const ROW_KEYS = ["discreetIcon", "pin"];

	const rows = new RovingFocusState({
		keys: () => ROW_KEYS,
		orientation: "both",
		openerScope: page.url.pathname,
	});
</script>

{#snippet rowContent({ title }: { title: string })}
	<Item.Content class="max-cramped:min-w-0">
		<Item.Title class="inline-block max-w-full min-w-0 truncate">
			{title}
		</Item.Title>
	</Item.Content>
	<Item.Actions class="min-w-0">
		<CaretRightIcon class="size-4 shrink-0" />
	</Item.Actions>
{/snippet}
{#snippet item({
	key,
	title,
	unimplemented,
}: {
	key: string;
	title: string;
	unimplemented: { message: UnimplementedMessageKey; issue: number };
})}
	<Item.Root variant="outline">
		{#snippet child({ props })}
			<a
				href="#/"
				{...props}
				onclick={(event) => {
					event.preventDefault();
					toast(ToastUnimplemented, {
						componentProps: unimplemented,
					});
				}}
				{@attach rows.item(key)}
			>
				{@render rowContent({ title })}
			</a>
		{/snippet}
	</Item.Root>
{/snippet}
<div class="contents" {@attach rows.container}>
	{#if disguiseAvailable()}
		<Item.Root variant="outline">
			{#snippet child({ props })}
				<a
					href="/settings/app/discreet-icon"
					{...props}
					{@attach rows.item("discreetIcon")}
				>
					{@render rowContent({
						title: t("settings.app.discreetAppIcon.title"),
					})}
				</a>
			{/snippet}
		</Item.Root>
	{:else}
		{@render item({
			key: "discreetIcon",
			title: t("settings.app.discreetAppIcon.title"),
			unimplemented: {
				message: "settings.app.discreetAppIcon.unimplemented",
				issue: 97,
			},
		})}
	{/if}
	{@render item({
		key: "pin",
		title: t("settings.app.pin.title"),
		unimplemented: { message: "settings.app.pin.unimplemented", issue: 50 },
	})}
</div>
