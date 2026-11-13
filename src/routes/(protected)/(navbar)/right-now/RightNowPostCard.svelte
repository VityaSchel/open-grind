<script lang="ts">
	import ChatIcon from "phosphor-svelte/lib/ChatIcon";

	import { conversationIdFor } from "#lib/chat/conversation-id.ts";
	import ProfileStatusIndicator from "#lib/components/profile/ProfileStatusIndicator.svelte";
	import UserAvatar from "#lib/components/profile/UserAvatar.svelte";
	import * as Avatar from "#lib/components/ui/avatar/index.ts";
	import { Button } from "#lib/components/ui/button/index.ts";
	import type { PostData } from "#lib/model/right-now/feed.ts";
	import RightNowPostMeta from "./RightNowPostMeta.svelte";
	import RightNowPostPhoto from "./RightNowPostPhoto.svelte";

	let { post, ourProfileId }: { post: PostData; ourProfileId: number } =
		$props();

	const headlineId = $props.id();

	const photo = $derived(post.media.at(0));
	const ownPost = $derived(post.profileId === ourProfileId);
	const conversationId = $derived(
		conversationIdFor({ profileId: post.profileId, ourProfileId }),
	);
	const joinedHeadline = $derived(
		post.displayName ? `${post.displayName} joined` : "Joined",
	);
	const profileLabel = $derived(
		post.displayName
			? `View ${post.displayName}'s profile`
			: "View profile",
	);
	const messageLabel = $derived(
		post.displayName ? `Message ${post.displayName}` : "Message",
	);
</script>

<article
	data-slot="right-now-post"
	aria-labelledby={headlineId}
	class="flex gap-3 py-3"
>
	<div class="relative h-fit shrink-0">
		<a
			href="/profile/{post.profileId}"
			aria-label={profileLabel}
			class="block rounded-full"
		>
			<Avatar.Root class="size-12 after:rounded-full">
				<UserAvatar
					mediaHash={post.mediaHash ?? null}
					class="size-full *:rounded-full"
					size="lg"
				/>
			</Avatar.Root>
		</a>
		<ProfileStatusIndicator
			onlineUntil={post.onlineUntil}
			class="pointer-events-none absolute end-0.5 bottom-0.5 rounded-full ring-2 ring-background"
		/>
	</div>
	<div class="flex min-w-0 flex-1 flex-col gap-2">
		<h2
			id={headlineId}
			class={[
				"font-heading text-base font-semibold wrap-break-word whitespace-pre-wrap",
				{ "text-muted-foreground": !post.text },
			]}
		>
			{post.text || joinedHeadline}
		</h2>
		{#if photo}
			<RightNowPostPhoto media={photo} />
		{/if}
		<div class="flex items-center justify-between gap-2">
			<RightNowPostMeta
				posted={post.posted}
				distance={post.distance}
				hosting={post.hosting}
			/>
			{#if !ownPost}
				<Button
					variant="ghost"
					size="icon"
					href="/chat/{conversationId}"
					aria-label={messageLabel}
				>
					<ChatIcon class="size-5" />
				</Button>
			{/if}
		</div>
	</div>
</article>
