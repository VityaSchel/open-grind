<script lang="ts">
	import { goto } from "$app/navigation";
	import DropIcon from "phosphor-svelte/lib/DropIcon";
	import PencilIcon from "phosphor-svelte/lib/PencilIcon";

	import { RightNowPostReport } from "#lib/components/report/right-now-post-report.svelte.ts";
	import RightNowPostReportSheet from "#lib/components/report/RightNowPostReportSheet.svelte";
	import { rightNowPostSheetRequest } from "#lib/components/right-now/post-sheet-request.svelte.ts";
	import ReportPostButton from "#lib/components/right-now/ReportPostButton.svelte";
	import RightNowPostPhoto from "#lib/components/right-now/RightNowPostPhoto.svelte";
	import RelativeTimeDynamic from "#lib/components/shared/RelativeTimeDynamic.svelte";
	import { Button } from "#lib/components/ui/button/index.ts";
	import * as Card from "#lib/components/ui/card/index.ts";
	import { getNow } from "#lib/util/now.ts";
	import type { RightNowPostDetails } from "#lib/model/right-now/post.ts";

	let { post, own }: { post: RightNowPostDetails; own: boolean } = $props();

	const titleId = $props.id();
	const report = new RightNowPostReport();

	const text = $derived(post.activeText?.trim() || null);
	const photo = $derived(
		post.media.find((media) => media.state === "APPROVED") ?? null,
	);
	const expired = $derived(
		post.expiration !== null && post.expiration <= getNow(),
	);
	const shown = $derived(!expired && (text !== null || photo !== null));

	function edit() {
		rightNowPostSheetRequest.request();
		void goto("/right-now");
	}
</script>

{#snippet action()}
	{#if own}
		<Button
			variant="secondary"
			size="sm"
			class="-my-1 shrink-0"
			onclick={edit}
		>
			<PencilIcon weight="fill" class="size-4" />
			Edit post
		</Button>
	{:else}
		<ReportPostButton
			onreport={() =>
				report.request({ postId: post.id, profileId: post.profileId })}
		/>
	{/if}
{/snippet}

{#snippet posted()}
	{#if post.posted !== null}
		<span aria-hidden="true">·</span>
		<time datetime={new Date(post.posted).toISOString()}>
			<RelativeTimeDynamic date={post.posted} />
		</time>
	{/if}
{/snippet}

{#snippet postPhoto()}
	{#if photo !== null}
		<RightNowPostPhoto
			media={photo}
			blurred={!own && photo.shouldBlur}
			size="sm"
		/>
	{/if}
{/snippet}

{#snippet postText()}
	{#if text !== null}
		<p
			class="min-w-0 flex-1 text-base wrap-break-word whitespace-pre-wrap select-text"
		>
			{text}
		</p>
	{/if}
{/snippet}

{#if shown}
	<section
		data-slot="profile-right-now-post"
		aria-labelledby={titleId}
		class="mt-6"
	>
		<Card.Root class="gap-3">
			<div class="flex items-center gap-2 px-6">
				<p
					class="flex min-w-0 flex-1 items-center gap-1.5 text-muted-foreground"
				>
					<DropIcon
						weight="fill"
						class="size-4 shrink-0 text-purple-500"
					/>
					<span id={titleId} class="font-medium text-foreground">
						Right Now
					</span>
					{@render posted()}
				</p>
				{@render action()}
			</div>
			<div class="flex items-start gap-4 px-6">
				{@render postText()}
				{@render postPhoto()}
			</div>
		</Card.Root>
	</section>
{/if}
<RightNowPostReportSheet {report} />
