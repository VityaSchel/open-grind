<script lang="ts">
	import DisplayName from "#lib/components/profile/DisplayName.svelte";
	import ProfileStatusIndicator from "#lib/components/profile/ProfileStatusIndicator.svelte";
	import UserAvatar from "#lib/components/profile/UserAvatar.svelte";
	import * as Avatar from "#lib/components/ui/avatar/index.ts";
	import * as Item from "#lib/components/ui/item/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import { longPressHandlers } from "#lib/util/long-press.ts";

	let {
		avatar,
		title,
		onlineUntil = null,
		active,
		selected,
		link,
		description,
		actions,
		control,
		menuButton,
		onToggleSelected,
		onLongPress,
		managedTabStops = false,
	}: {
		avatar: {
			mediaHash: string | null;
			overlay?: import("svelte").Snippet;
			link?: string;
		};
		title: {
			value: string | null;
			fallback?: string;
			badge?: import("svelte").Snippet;
		};
		onlineUntil?: number | null;
		active?: boolean;
		selected?: boolean;
		link: string;
		description?: import("svelte").Snippet;
		actions?: import("svelte").Snippet;
		control?: import("svelte").Snippet;
		menuButton?: import("svelte").Snippet;
		onToggleSelected?: () => void;
		onLongPress?: () => void;
		managedTabStops?: boolean;
	} = $props();

	const longPress = $derived(
		onLongPress ? longPressHandlers(onLongPress) : {},
	);
	const linkTabindex = $derived(
		onToggleSelected || managedTabStops ? -1 : undefined,
	);
	const accessibleName = $derived(
		title.value ?? title.fallback ?? t("common.someone"),
	);
</script>

{#snippet avatarNode()}
	<Item.Media class="relative translate-y-0! rounded-2xl p-2">
		<Avatar.Root class="size-20 after:rounded-xl">
			<UserAvatar
				mediaHash={avatar.mediaHash}
				class="size-20 rounded-xl bg-neutral-700 *:rounded-xl"
			/>
		</Avatar.Root>
		{@render avatar.overlay?.()}
	</Item.Media>
{/snippet}
{#snippet contentNode()}
	<Item.Content class="min-w-0 flex-1">
		<Item.Title
			class={[
				"flex w-auto min-w-0 items-center gap-1 truncate",
				{ "text-muted-foreground": !title.value },
			]}
		>
			{@render title.badge?.()}
			<ProfileStatusIndicator {onlineUntil} />
			<DisplayName
				name={title.value}
				fallback={title.fallback}
				class="truncate"
			/>
		</Item.Title>
		{@render description?.()}
	</Item.Content>
	{@render actions?.()}
{/snippet}
<Item.Root
	variant={active ? "muted" : "outline"}
	class={[
		"@container relative flex min-w-24 flex-nowrap items-stretch gap-0 p-0",
		{
			"border-primary outline-2 -outline-offset-2 outline-primary outline-solid":
				selected,
			"[-webkit-touch-callout:none] **:[-webkit-touch-callout:none]":
				!!onLongPress,
		},
	]}
	{...longPress}
>
	{#if avatar.link}
		<div role="gridcell" class="contents @max-row:hidden">
			<a
				href={avatar.link}
				data-slot="profile-item-avatar-link"
				aria-label={t("profile.item.a11y.profileLink", {
					name: accessibleName,
				})}
				class="rounded-l-2xl"
				tabindex={linkTabindex}
			>
				{@render avatarNode()}
			</a>
		</div>
		<div role="gridcell" class="contents @max-row:hidden">
			<a
				href={link}
				data-slot="profile-item-link"
				class="content gap-0.5 rounded-r-2xl p-4 ps-2"
				tabindex={linkTabindex}
			>
				{@render contentNode()}
			</a>
		</div>
		<div role="gridcell" class="contents @row:hidden">
			<a
				href={link}
				data-slot="profile-item-link"
				aria-label={accessibleName}
				class="min-w-24 rounded-2xl"
				tabindex={linkTabindex}
			>
				{@render avatarNode()}
			</a>
		</div>
	{:else}
		<div role="gridcell" class="contents">
			<a
				href={link}
				data-slot="profile-item-link"
				class="content gap-2.5 overflow-clip rounded-2xl pe-4"
				tabindex={linkTabindex}
			>
				{@render avatarNode()}
				{@render contentNode()}
			</a>
		</div>
	{/if}
	{#if control}
		<div role="gridcell" class="flex shrink-0 items-center ps-3 pe-4">
			{@render control()}
		</div>
	{/if}
	{#if menuButton}
		<div role="gridcell" class="contents">
			{@render menuButton()}
		</div>
	{/if}
	{#if selected}
		<div
			class="pointer-events-none absolute -inset-px z-1 rounded-[inherit] bg-primary/20"
		></div>
	{/if}
	{#if onToggleSelected}
		<div role="gridcell" class="contents">
			<button
				type="button"
				data-slot="profile-item-selection-toggle"
				class="absolute inset-0 z-2 rounded-[inherit]"
				aria-pressed={selected ?? false}
				aria-label={accessibleName}
				onclick={onToggleSelected}
			></button>
		</div>
	{/if}
</Item.Root>

<style lang="postcss">
	@reference "$layout";

	.content {
		@apply flex min-w-0 flex-1 items-center self-stretch;
	}
</style>
