<script lang="ts">
	import StarIcon from "phosphor-svelte/lib/StarIcon";

	import QuickFilterButton from "#lib/components/filters/QuickFilterButton.svelte";
	import QuickFilterToggle from "#lib/components/filters/QuickFilterToggle.svelte";
	import ProgressiveBlur from "#lib/components/shared/ProgressiveBlur.svelte";
	import { t } from "#lib/i18n/index.ts";
	import { RovingFocusState } from "#lib/util/roving-focus-state.svelte.ts";
	import { topChrome } from "#lib/util/screen-chrome.svelte.ts";
	import type { ConversationFilters } from "#lib/chat/conversation-filters.svelte.ts";
	import type { ConversationFilterValues } from "#lib/model/messaging/conversation-filters.ts";
	import DistanceQuickFilter from "./DistanceQuickFilter.svelte";
	import PositionQuickFilter from "./PositionQuickFilter.svelte";

	let {
		filters,
		onchange,
		inert = false,
		locked = false,
	}: {
		filters: ConversationFilters;
		onchange: (values: Partial<ConversationFilterValues>) => void;
		inert?: boolean;
		locked?: boolean;
	} = $props();

	const CHIPS = [
		"favorites",
		"unread",
		"online",
		"rightNow",
		"distance",
		"position",
	] as const;

	const chips = new RovingFocusState({
		keys: () => CHIPS,
		orientation: "horizontal",
		wrap: "loop",
	});

	const values = $derived(filters.value);

	let open = $state({ distance: false, position: false });
</script>

<ProgressiveBlur
	direction="topToBottom"
	data-fixed-header
	class="absolute inset-x-0 top-0 z-10"
	bgClass="bg-linear-to-b from-background to-transparent"
	{inert}
	{@attach !inert && topChrome}
>
	<div
		role="toolbar"
		aria-label={t("chat.filters.a11y.toolbar")}
		data-scroll-intent="x"
		class="scrollbar-thin flex gap-0.5 overflow-x-auto px-4 pt-4 pb-2"
		inert={locked}
		{@attach chips.container}
	>
		<div class="flex h-9 w-fit items-center">
			<QuickFilterToggle
				aria-label={t("chat.filters.a11y.favoritesOnly")}
				bind:pressed={
					() => values.favorites,
					(favorites) => onchange({ favorites })
				}
				{@attach chips.item("favorites")}
			>
				<StarIcon weight={values.favorites ? "fill" : "bold"} />
			</QuickFilterToggle>
		</div>
		<div class="flex h-9 w-fit items-center">
			<QuickFilterToggle
				bind:pressed={
					() => values.unread, (unread) => onchange({ unread })
				}
				{@attach chips.item("unread")}
			>
				{t("chat.filters.unread")}
			</QuickFilterToggle>
			<QuickFilterToggle
				bind:pressed={
					() => values.online, (online) => onchange({ online })
				}
				{@attach chips.item("online")}
			>
				{t("common.filters.online")}
			</QuickFilterToggle>
			<QuickFilterToggle
				bind:pressed={
					() => values.rightNow, (rightNow) => onchange({ rightNow })
				}
				{@attach chips.item("rightNow")}
			>
				{t("common.filters.rightNow")}
			</QuickFilterToggle>
		</div>
		<QuickFilterButton
			active={values.distanceMetres !== null}
			drawerOpen={open.distance}
			onclick={() => (open.distance = true)}
			{@attach chips.item("distance")}
		>
			{t("common.filters.distance.label")}
		</QuickFilterButton>
		<QuickFilterButton
			active={values.positions.length > 0}
			drawerOpen={open.position}
			onclick={() => (open.position = true)}
			{@attach chips.item("position")}
		>
			{t("common.filters.position.label")}
		</QuickFilterButton>
	</div>
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
