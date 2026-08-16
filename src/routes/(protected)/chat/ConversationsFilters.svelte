<script lang="ts">
	import { StarIcon } from "phosphor-svelte";

	import {
		CONVERSATION_FILTER_KEYS,
		type ConversationFilterKey,
		type ConversationFilters,
	} from "$lib/chat/conversation-filters.svelte";
	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import { buttonVariants } from "$lib/components/ui/button";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";

	let {
		filters,
		onchange,
		inert = false,
	}: {
		filters: ConversationFilters;
		onchange: (active: ConversationFilterKey[]) => void;
		inert?: boolean;
	} = $props();

	const pills: Record<
		ConversationFilterKey,
		{ label: string; icon: typeof StarIcon }
	> = { favorites: { label: "Favorites only", icon: StarIcon } };
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
			() => filters.active,
			(values: string[]) =>
				onchange(
					CONVERSATION_FILTER_KEYS.filter((key) =>
						values.includes(key),
					),
				)
		}
	>
		{#each CONVERSATION_FILTER_KEYS as key (key)}
			{@const pill = pills[key]}
			<ToggleGroup.Item
				value={key}
				aria-label={pill.label}
				class={buttonVariants({ variant: "secondary" })}
			>
				<pill.icon
					weight={filters.active.includes(key) ? "fill" : "bold"}
				/>
			</ToggleGroup.Item>
		{/each}
	</ToggleGroup.Root>
</ProgressiveBlur>
