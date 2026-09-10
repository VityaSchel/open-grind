<script lang="ts">
	import { StarIcon } from "phosphor-svelte";

	import QuickFilterButton from "$lib/components/filters/QuickFilterButton.svelte";
	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import { buttonVariants } from "$lib/components/ui/button";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import type { ConversationFilters } from "$lib/chat/conversation-filters.svelte";
	import type { ConversationFilterValues } from "$lib/model/messaging/conversation-filters";
	import DistanceQuickFilter from "./DistanceQuickFilter.svelte";
	import PositionQuickFilter from "./PositionQuickFilter.svelte";

	let {
		filters,
		onchange,
		inert = false,
	}: {
		filters: ConversationFilters;
		onchange: (values: Partial<ConversationFilterValues>) => void;
		inert?: boolean;
	} = $props();

	const LABELLED_TOGGLES = [
		{ key: "unread", label: "Unread" },
		{ key: "online", label: "Online" },
		{ key: "rightNow", label: "Right now" },
	] as const;

	const values = $derived(filters.value);

	let open = $state({ distance: false, position: false });
</script>

<ProgressiveBlur
	direction="topToBottom"
	data-fixed-header
	class="absolute inset-x-0 top-0 z-10"
	bgClass="bg-linear-to-b from-background to-transparent"
	contentClass="scrollbar-thin flex gap-0.5 overflow-x-auto px-4 pt-4 pb-2"
	{inert}
>
	<ToggleGroup.Root
		type="multiple"
		variant="default"
		size="sm"
		class="h-9"
		bind:value={
			() => (values.favorites ? ["favorites"] : []),
			(active: string[]) =>
				onchange({ favorites: active.includes("favorites") })
		}
	>
		<ToggleGroup.Item
			value="favorites"
			aria-label="Favorites only"
			class={buttonVariants({ variant: "secondary" })}
		>
			<StarIcon weight={values.favorites ? "fill" : "bold"} />
		</ToggleGroup.Item>
	</ToggleGroup.Root>
	<ToggleGroup.Root
		type="multiple"
		variant="default"
		size="sm"
		class="h-9"
		bind:value={
			() =>
				LABELLED_TOGGLES.filter(({ key }) => values[key]).map(
					({ key }) => key,
				),
			(active: string[]) =>
				onchange({
					unread: active.includes("unread"),
					online: active.includes("online"),
					rightNow: active.includes("rightNow"),
				})
		}
	>
		{#each LABELLED_TOGGLES as { key, label } (key)}
			<ToggleGroup.Item
				value={key}
				class={buttonVariants({ variant: "secondary" })}
			>
				{label}
			</ToggleGroup.Item>
		{/each}
	</ToggleGroup.Root>
	<QuickFilterButton
		active={values.distanceMetres !== null}
		onclick={() => (open.distance = true)}
	>
		Distance
	</QuickFilterButton>
	<QuickFilterButton
		active={values.positions.length > 0}
		onclick={() => (open.position = true)}
	>
		Position
	</QuickFilterButton>
</ProgressiveBlur>

<DistanceQuickFilter
	bind:open={open.distance}
	distanceMetres={values.distanceMetres}
	onapply={(distanceMetres) => onchange({ distanceMetres })}
/>
<PositionQuickFilter
	bind:open={open.position}
	positions={values.positions}
	onapply={(positions) => onchange({ positions })}
/>
