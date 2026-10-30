<script lang="ts">
	import CaretRightIcon from "phosphor-svelte/lib/CaretRightIcon";
	import UserCircleIcon from "phosphor-svelte/lib/UserCircleIcon";

	import { isHalloween } from "$lib/components/halloween/halloween";
	import VampireIcon from "$lib/components/halloween/VampireIcon.svelte";
	import * as Item from "$lib/components/ui/item";
</script>

<Item.Root variant="outline">
	{#snippet child({ props })}
		<a href="/settings/account" {...props}>
			<Item.Media>
				{#if isHalloween()}
					<VampireIcon class="size-5" />
				{:else}
					<UserCircleIcon weight="fill" class="size-5" />
				{/if}
			</Item.Media>
			<Item.Content class="min-w-0">
				<Item.Title
					class="inline-block w-full min-w-0 truncate text-left"
				>
					Account Settings
				</Item.Title>
			</Item.Content>
			<Item.Actions>
				<CaretRightIcon class="size-4" />
			</Item.Actions>
		</a>
	{/snippet}
</Item.Root>
