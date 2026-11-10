<script lang="ts">
	import ChatIcon from "phosphor-svelte/lib/ChatIcon";
	import HourglassMediumIcon from "phosphor-svelte/lib/HourglassMediumIcon";
	import PencilIcon from "phosphor-svelte/lib/PencilIcon";

	import { conversationIdFor } from "#lib/chat/conversation-id.ts";
	import ProfileStatusIndicator from "#lib/components/profile/ProfileStatusIndicator.svelte";
	import UserAvatar from "#lib/components/profile/UserAvatar.svelte";
	import ReportPostButton from "#lib/components/right-now/ReportPostButton.svelte";
	import RightNowPostMeta from "#lib/components/right-now/RightNowPostMeta.svelte";
	import RightNowPostPhoto from "#lib/components/right-now/RightNowPostPhoto.svelte";
	import * as Avatar from "#lib/components/ui/avatar/index.ts";
	import { Button } from "#lib/components/ui/button/index.ts";
	import type { PostData } from "#lib/model/right-now/feed.ts";

	let {
		post,
		ourProfileId,
		underReview = false,
		onedit,
		onreport,
	}: {
		post: PostData;
		ourProfileId: number;
		underReview?: boolean;
		onedit: (() => void) | null;
		onreport: () => Promise<void>;
	} = $props();

	const headlineId = $props.id();

	const photo = $derived(post.media.at(0));
	const ownPost = $derived(post.profileId === ourProfileId);
	const reportable = $derived(Boolean(post.text) || photo !== undefined);
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
		<div class="flex items-start gap-2">
			<h2
				id={headlineId}
				class={[
					"min-w-0 flex-1 font-heading text-base font-medium wrap-break-word whitespace-pre-wrap",
					{ "text-muted-foreground": !post.text },
				]}
			>
				{post.text || joinedHeadline}
			</h2>
			{#if !ownPost && reportable}
				<ReportPostButton {onreport} />
			{/if}
		</div>
		{#if ownPost && underReview}
			<p
				data-slot="right-now-post-review"
				class="flex items-center gap-1 text-sm text-muted-foreground"
			>
				<HourglassMediumIcon class="size-4" />
				Under review
			</p>
		{/if}
		{#if photo}
			<RightNowPostPhoto
				media={photo.data}
				blurred={photo.data.isNsfw && photo.data.shouldBlur}
			/>
		{/if}
		<div class="flex items-center justify-between gap-2">
			<RightNowPostMeta
				posted={post.posted}
				distance={post.distance}
				hosting={post.hosting}
			/>
			{#if ownPost}
				{#if onedit !== null}
					<Button
						variant="secondary"
						size="sm"
						aria-label="Edit your post"
						onclick={onedit}
					>
						<PencilIcon weight="fill" class="size-4" />
						Edit
					</Button>
				{/if}
			{:else}
				<Button
					variant="secondary"
					size="sm"
					href="/chat/{conversationId}"
					aria-label={messageLabel}
				>
					<ChatIcon weight="fill" class="size-4" />
					Message
				</Button>
			{/if}
		</div>
	</div>
</article>
