<script lang="ts">
	import CaretRightIcon from "phosphor-svelte/lib/CaretRightIcon";
	import { toast } from "svelte-sonner";

	import ToastUnimplemented from "$lib/components/feedback/ToastUnimplemented.svelte";
	import * as Item from "$lib/components/ui/item";
	import { t } from "$lib/i18n";
	import type { UnimplementedMessageKey } from "$lib/components/feedback/unimplemented";
</script>

{#snippet item({
	title,
	unimplemented,
}: {
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
{@render item({
	title: t("settings.app.discreetAppIcon.title"),
	unimplemented: {
		message: "settings.app.discreetAppIcon.unimplemented",
		issue: 97,
	},
})}
{@render item({
	title: t("settings.app.pin.title"),
	unimplemented: { message: "settings.app.pin.unimplemented", issue: 50 },
})}
