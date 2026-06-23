<script lang="ts">
	import { ArrowSquareOutIcon } from "phosphor-svelte";

	import { Button } from "$lib/components/ui/button";
	import * as Dialog from "$lib/components/ui/dialog";
	import * as Item from "$lib/components/ui/item";
	import Link from "$lib/components/ui/link/Link.svelte";
	import ButtonItemContent from "./ButtonItemContent.svelte";

	let {
		label,
		destination,
		icon,
		warning,
	}: {
		label: string;
		destination: string;
		icon: import("svelte").Snippet;
		warning?: {
			title: string;
			description: string;
			primary: {
				label: string;
				destination: string;
			};
			secondary: {
				label: string;
				destination: string;
			};
		};
	} = $props();

	let warningOpen = $state(false);
</script>

{#snippet content()}
	<Item.Media>
		{@render icon()}
	</Item.Media>
	<Item.Content class="min-w-0">
		<Item.Title class="truncate max-w-full inline-block">{label}</Item.Title>
	</Item.Content>
	<Item.Actions>
		<ArrowSquareOutIcon class="size-4" />
	</Item.Actions>
{/snippet}
<Item.Root variant="default" size="sm">
	{#snippet child({ props })}
		{#if warning}
			<ButtonItemContent
				{...props}
				variant="ghost"
				onclick={() => (warningOpen = true)}
			>
				{@render content()}
			</ButtonItemContent>
		{:else}
			<Link
				href={destination}
				{...props}
				class={["truncate", props.class, "flex-nowrap!"]}
			>
				{@render content()}
			</Link>
		{/if}
	{/snippet}
</Item.Root>
{#if warning}
	{#snippet warningButton(link: {
		variant: import("svelte").ComponentProps<typeof Button>["variant"];
		destination: string;
		label: string;
	})}
		<Button
			variant={link.variant}
			href={link.destination}
			target="_blank"
			rel="nofollow noreferrer noopener"
		>
			<span class="inline-block truncate w-full text-center">
				{link.label}
			</span>
		</Button>
	{/snippet}
	<Dialog.Root bind:open={warningOpen}>
		<Dialog.Content
			preventOverflowTextSelection={false}
			showCloseButton={false}
			class="max-xs:max-w-[calc(100%-1rem)] max-xs:text-center flex flex-col"
		>
			<Dialog.Header class="max-w-full">
				<Dialog.Title>{warning.title}</Dialog.Title>
				<Dialog.Description>
					{warning.description}
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Footer class="flex-col sm:flex-col max-w-full">
				{@render warningButton({ variant: "default", ...warning.primary })}
				{@render warningButton({ variant: "secondary", ...warning.secondary })}
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
{/if}
