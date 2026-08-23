<script lang="ts">
	import { ChatIcon, StarIcon } from "phosphor-svelte";
	import type { Snippet } from "svelte";

	import DisplayName from "$lib/components/profile/DisplayName.svelte";
	import DistanceFormatted from "$lib/components/profile/DistanceFormatted.svelte";
	import ProfileStatusIndicator from "$lib/components/profile/ProfileStatusIndicator.svelte";
	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import { Badge } from "$lib/components/ui/badge";

	let {
		mediaHash = null,
		displayName = null,
		age = null,
		distance = null,
		unread = null,
		onlineUntil = null,
		isFavorite = false,
		isVisiting = false,
		hadRecentChat = false,
		anonymous = false,
		href = null,
		class: className,
		overlay,
	}: {
		mediaHash?: string | null;
		displayName?: string | null;
		age?: number | null;
		distance?: number | null;
		unread?: number | null;
		onlineUntil?: number | null;
		isFavorite?: boolean;
		isVisiting?: boolean;
		hadRecentChat?: boolean;
		anonymous?: boolean;
		href?: string | null;
		class?: import("svelte/elements").ClassValue;
		overlay?: Snippet;
	} = $props();
</script>

{#snippet content()}
	<div class="absolute size-full bg-stone-700">
		<UserAvatar {mediaHash} class="size-full" size="xl" />
	</div>
	{#if distance !== null}
		<span class="profile-card-distance absolute top-1 right-1.5">
			<DistanceFormatted {distance} />
		</span>
	{/if}
	{#if isFavorite || hadRecentChat}
		<div
			class="absolute inset-s-2 top-2 z-1 flex w-1/6 flex-col items-center gap-1"
		>
			{#if isFavorite}
				<div class="badge">
					<StarIcon
						weight="fill"
						class="m-auto size-4/6 text-yellow-500"
					/>
					<span class="sr-only">Favorite</span>
				</div>
			{/if}
			{#if hadRecentChat}
				<div class="badge">
					<ChatIcon
						weight="fill"
						class="m-auto size-3/5 -translate-y-px text-sky-400"
					/>
					<span class="sr-only">Chatted recently</span>
				</div>
			{/if}
		</div>
	{/if}
	{#if !anonymous}
		<div class="z-1 flex w-full items-center gap-0.5 p-0.5">
			<Badge
				variant="outline"
				class="max-w-full min-w-0 shrink gap-0 bg-popover/20 backdrop-blur-2xl"
			>
				<ProfileStatusIndicator
					{onlineUntil}
					{isVisiting}
					class="me-1"
				/>

				<span
					class={[
						"block shrink truncate font-semibold",
						{ "text-foreground/50": !displayName },
					]}
				>
					<DisplayName name={displayName} />
				</span>
				{#if age !== null}
					,&nbsp;<span
						class="line-clamp-1 block max-w-full shrink-0 truncate"
					>
						{age}
					</span>
				{/if}
			</Badge>
			{#if unread !== null && unread > 0}
				<span
					class="flex size-5 shrink-0 items-center justify-center rounded-full border border-black/20 bg-primary text-2xs font-semibold text-primary-foreground"
				>
					{#if unread > 99}
						<span class="text-3xs">99+</span>
					{:else}
						{unread}
					{/if}
					<span class="sr-only">unread messages</span>
				</span>
			{/if}
		</div>
	{/if}
	{@render overlay?.()}
{/snippet}

{#if href !== null}
	<a
		{href}
		aria-label={anonymous ? "Profile" : undefined}
		class={[
			"relative flex aspect-square items-end overflow-hidden",
			className,
		]}
	>
		{@render content()}
	</a>
{:else}
	<div
		class={[
			"relative flex aspect-square items-end overflow-hidden",
			className,
		]}
	>
		{@render content()}
	</div>
{/if}

<style lang="postcss">
	@reference "$layout";

	.badge {
		@apply flex aspect-square h-auto w-full rounded-full border border-white/10 bg-popover/40 backdrop-blur-2xl;
	}
</style>
