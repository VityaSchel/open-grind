<script lang="ts">
	import { CaretRightIcon } from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import ToastUnimplemented from "$lib/components/ToastUnimplemented.svelte";
	import * as Item from "$lib/components/ui/item";
	import RevealMessageReadSetting from "./RevealMessageReadSetting.svelte";
	import RevealProfileViewSetting from "./RevealProfileViewSetting.svelte";
	import UnitsSetting from "./UnitsSetting.svelte";
</script>

{#snippet item({
	title,
	unimplemented,
}: {
	title: string;
	unimplemented: { feature: string; issue: number };
})}
	<Item.Root variant="outline">
		{#snippet child({ props })}
			<a
				href="#/"
				{...props}
				onclick={() =>
					toast(ToastUnimplemented, {
						componentProps: unimplemented,
					})}
			>
				<Item.Content class="max-xxxxs:min-w-0">
					<Item.Title class="min-w-0 max-w-full truncate inline-block">
						{title}
					</Item.Title>
				</Item.Content>
				<Item.Actions class="min-w-0">
					<!-- <Item.Description class="min-w-0">{value}</Item.Description> -->
					<CaretRightIcon class="size-4 shrink-0" />
				</Item.Actions>
			</a>
		{/snippet}
	</Item.Root>
{/snippet}
<h2>Display</h2>
<UnitsSetting />
{@render item({
	title: "Notifications",
	unimplemented: { feature: "Notifications", issue: 45 },
})}
<h2>Privacy</h2>
<RevealMessageReadSetting />
<RevealProfileViewSetting />
<h2>Security</h2>
{@render item({
	title: "Discreet App Icon",
	unimplemented: { feature: "Discreet App Icon", issue: 97 },
})}
{@render item({
	title: "PIN",
	unimplemented: { feature: "PIN", issue: 50 },
})}

<style lang="postcss">
	@reference "$layout";

	h2 {
		@apply ps-4 mt-2 text-xl font-semibold tracking-tight truncate;
	}
</style>
