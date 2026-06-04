<script lang="ts">
	import { DotsThreeIcon, FlagIcon, ProhibitIcon } from "phosphor-svelte";

	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";

	let {
		profileId,
	}: {
		profileId: number;
	} = $props();

	let submitting = $state(false);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props: { class: className, ...props } })}
			<Button
				size="icon-lg"
				variant="secondary"
				aria-label="Profile menu"
				class={[className, "size-12"]}
				disabled={submitting}
				{...props}
			>
				<DotsThreeIcon class="size-8" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content class="w-42" align="end">
		<DropdownMenu.Item
			onSelect={() => console.log("Report profile", profileId)}
		>
			<FlagIcon class="size-5" />
			Report profile
		</DropdownMenu.Item>
		<DropdownMenu.Item onSelect={() => console.log("Block profile", profileId)}>
			<ProhibitIcon class="size-5" />
			Block profile
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
