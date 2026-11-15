<script lang="ts">
	import ChatIcon from "phosphor-svelte/lib/ChatIcon";
	import HourglassMediumIcon from "phosphor-svelte/lib/HourglassMediumIcon";
	import PencilIcon from "phosphor-svelte/lib/PencilIcon";

	import { conversationIdFor } from "#lib/chat/conversation-id.ts";
	import ProfileStatusIndicator from "#lib/components/profile/ProfileStatusIndicator.svelte";
	import UserAvatar from "#lib/components/profile/UserAvatar.svelte";
	import RightNowPostMeta from "#lib/components/right-now/RightNowPostMeta.svelte";
	import * as Avatar from "#lib/components/ui/avatar/index.ts";
	import { Button } from "#lib/components/ui/button/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import type { PostData } from "#lib/model/right-now/feed.ts";
	import PostHeadline from "./PostHeadline.svelte";
	import RightNowPostPhoto from "./RightNowPostPhoto.svelte";

	let {
		post,
		ourProfileId,
		underReview,
		onedit,
		onreport,
	}: {
		post: PostData;
		ourProfileId: number;
		underReview: boolean;
		onedit: (() => void) | null;
		onreport: () => Promise<void>;
	} = $props();

	const headlineId = $props.id();

	const photo = $derived(post.media.at(0));
	const ownPost = $derived(post.profileId === ourProfileId);
	const conversationId = $derived(
		conversationIdFor({ profileId: post.profileId, ourProfileId }),
	);
	const joinedHeadline = $derived(
		post.displayName
			? t("browse.rightNow.post.joined", { name: post.displayName })
			: t("browse.rightNow.post.joinedAnonymous"),
	);
	const profileLabel = $derived(
		post.displayName
			? t("browse.rightNow.post.a11y.viewProfile", {
					name: post.displayName,
				})
			: t("browse.rightNow.post.a11y.viewProfileAnonymous"),
	);
	const messageLabel = $derived(
		post.displayName
			? t("browse.rightNow.post.a11y.message", { name: post.displayName })
			: t("browse.rightNow.post.message"),
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
					own={ownPost}
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
		<PostHeadline
			id={headlineId}
			text={post.text}
			placeholder={joinedHeadline}
			hasPhoto={photo !== undefined}
			onreport={ownPost ? null : onreport}
		/>
		{#if ownPost && underReview}
			<p
				data-slot="right-now-post-review"
				class="flex items-center gap-1 text-sm text-muted-foreground"
			>
				<HourglassMediumIcon class="size-4" />
				{t("browse.rightNow.post.underReview")}
			</p>
		{/if}
		{#if photo}
			<RightNowPostPhoto media={photo} own={ownPost} />
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
						aria-label={t("browse.rightNow.post.a11y.edit")}
						onclick={onedit}
					>
						<PencilIcon weight="fill" class="size-4" />
						{t("browse.rightNow.post.edit")}
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
					{t("browse.rightNow.post.message")}
				</Button>
			{/if}
		</div>
	</div>
</article>
