<script lang="ts">
	import { ArrowLeftIcon } from "phosphor-svelte";

	import DisplayName from "$lib/components/DisplayName.svelte";
	import DistanceFormatted from "$lib/components/DistanceFormatted.svelte";
	import ProgressiveBlur from "$lib/components/ProgressiveBlur.svelte";
	import * as Avatar from "$lib/components/ui/avatar";
	import * as Card from "$lib/components/ui/card";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import UserAvatar from "$lib/components/UserAvatar.svelte";
	import type { ConversationState } from "./conversation-state.svelte";

	let { conversationState }: { conversationState: ConversationState } =
		$props();
</script>

<ProgressiveBlur
	direction="topToBottom"
	class="absolute z-10 h-19 w-full shrink-0"
	bgClass="bg-linear-to-b max-split:from-background split:from-card to-transparent"
	contentClass="flex items-center h-full"
	tag="nav"
>
	<a href="/chat" class="flex h-full w-19 items-center justify-center">
		<ArrowLeftIcon size={32} />
	</a>
	{#if conversationState.loading || conversationState.profile === null}
		<div class="flex flex-1 items-center gap-3 py-4 ps-0">
			<Skeleton class="size-avatar rounded-full" />
			<div class="flex flex-col gap-2">
				<Skeleton class="h-4 w-20 rounded-md" />
				<Skeleton class="h-3 w-12 rounded-md" />
			</div>
		</div>
	{:else if conversationState.error}
		<span class="flex-1">Failed to load conversation</span>
	{:else}
		{@const profile = conversationState.profile}
		<a href="/profile/{profile.profileId}" class="flex-1 py-4 ps-0 pe-4">
			<Card.Header class="flex items-center gap-4 px-0">
				<Avatar.Root class="size-avatar after:rounded-full">
					<UserAvatar
						mediaHash={profile.mediaHash ?? null}
						class="size-full *:rounded-full"
						size="lg"
					/>
				</Avatar.Root>
				<div class="flex min-w-0 flex-col">
					<Card.Title
						class={[
							"min-w-0 truncate",
							{
								"text-muted-foreground": !profile.name,
							},
						]}
					>
						<DisplayName name={profile.name} />
					</Card.Title>
					{#if profile.distance === null}
						<Card.Description class="truncate">
							Distance unknown
						</Card.Description>
					{:else}
						<Card.Description class="truncate">
							<DistanceFormatted distance={profile.distance} />
						</Card.Description>
					{/if}
				</div>
			</Card.Header>
		</a>
	{/if}
</ProgressiveBlur>
