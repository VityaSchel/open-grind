<script lang="ts">
	import { goto } from "$app/navigation";
	import EyeSlashIcon from "phosphor-svelte/lib/EyeSlashIcon";
	import { mount, untrack } from "svelte";

	import { showErrorToast } from "#lib/api/error-toast.ts";
	import { RightNowPostReport } from "#lib/components/report/right-now-post-report.svelte.ts";
	import RightNowPostReportSheet from "#lib/components/report/RightNowPostReportSheet.svelte";
	import { rightNowPostSheetRequest } from "#lib/components/right-now/post-sheet-request.svelte.ts";
	import SplashIcon from "#lib/components/right-now/SplashIcon.svelte";
	import MediaImage from "#lib/components/shared/MediaImage.svelte";
	import RelativeTimeDynamic from "#lib/components/shared/RelativeTimeDynamic.svelte";
	import * as Card from "#lib/components/ui/card/index.ts";
	import { proxyMediaUrl } from "#lib/util/media.ts";
	import { getNow } from "#lib/util/now.ts";
	import {
		applyPhotoSwipeComponent,
		openLightbox,
	} from "#lib/util/photoswipe/index.ts";
	import type { RightNowPostDetails } from "#lib/model/right-now/post.ts";
	import {
		applyPhotoSwipeBarAction,
		applyPhotoSwipeCaption,
		closeWhenOpen,
	} from "./right-now-viewer.ts";
	import RightNowPostCaption from "./RightNowPostCaption.svelte";
	import RightNowPostViewerAction from "./RightNowPostViewerAction.svelte";

	let {
		post,
		own,
		displayName,
		onlineUntil,
		distance,
	}: {
		post: RightNowPostDetails;
		own: boolean;
		displayName: string | null;
		onlineUntil: number | null;
		distance?: number;
	} = $props();

	const titleId = $props.id();
	const report = new RightNowPostReport();

	const text = $derived(post.activeText?.trim() || null);
	const photo = $derived(
		post.media.find((media) => media.state === "APPROVED") ?? null,
	);
	const blurred = $derived(photo !== null && !own && photo.shouldBlur);
	const viewerPhoto = $derived(blurred ? null : photo);
	const expired = $derived(
		post.expiration !== null && post.expiration <= getNow(),
	);
	const shown = $derived(!expired && (text !== null || photo !== null));

	let viewing = $state(false);
	let openButton: HTMLButtonElement | null = $state(null);

	$effect(() => {
		if (!viewing) return;
		const controller = new AbortController();
		untrack(() => openViewer(controller.signal));
		return () => controller.abort();
	});

	function openViewer(signal: AbortSignal) {
		const caption = {
			text,
			displayName,
			onlineUntil,
			posted: post.posted,
			distance,
			hosting: post.hosting,
		};
		openLightbox({
			items: [
				{
					src:
						viewerPhoto === null
							? ""
							: proxyMediaUrl(viewerPhoto.fullImageUrl),
				},
			],
			configure: (lightbox) => {
				lightbox.options.bgOpacity = 1;
				if (viewerPhoto === null)
					applyPhotoSwipeComponent(lightbox, {
						slideAt: () => caption,
						render: ({ target, slide, content }) => {
							target.classList.add("pointer-events-none");
							const component = mount(RightNowPostCaption, {
								target,
								props: { ...slide, centered: true },
							});
							content.onLoaded();
							return component;
						},
					});
				else
					applyPhotoSwipeCaption(lightbox, {
						render: ({ target }) =>
							mount(RightNowPostCaption, {
								target,
								props: caption,
							}),
					});
				applyPhotoSwipeBarAction(lightbox, {
					render: ({ target, pswp }) =>
						mount(RightNowPostViewerAction, {
							target,
							props: {
								own,
								onreport: () =>
									report.request({
										postId: post.id,
										profileId: post.profileId,
										beforeOpen: () => {
											closeWhenOpen(pswp);
											openButton?.focus();
										},
									}),
								onedit: () => {
									closeWhenOpen(pswp);
									edit();
								},
							},
						}),
				});
			},
			signal,
			onClosed: () => (viewing = false),
		}).catch((error: unknown) => {
			if (signal.aborted) return;
			console.error(error);
			showErrorToast({ label: "Failed to open Right Now post", error });
			viewing = false;
		});
	}

	function edit() {
		rightNowPostSheetRequest.request();
		void goto("/right-now");
	}
</script>

{#if shown}
	<section
		data-slot="profile-right-now-post"
		aria-labelledby={titleId}
		class="mt-6"
	>
		<Card.Root
			class="relative isolate gap-3 transition-colors has-[button:focus-visible]:ring-3 has-[button:focus-visible]:ring-ring/50 can-hover:has-[button:hover]:bg-muted"
		>
			<p
				class="flex min-w-0 items-center gap-1.5 px-6 text-muted-foreground"
			>
				<SplashIcon
					weight="fill"
					class="size-4 shrink-0 text-purple-400"
				/>
				<button
					type="button"
					id={titleId}
					bind:this={openButton}
					data-slot="profile-right-now-post-open"
					aria-haspopup="dialog"
					class="font-medium text-foreground outline-none after:absolute after:inset-0 after:z-1"
					onclick={() => (viewing = true)}
				>
					Right Now
				</button>
				{#if post.posted !== null}
					<span aria-hidden="true">·</span>
					<time datetime={new Date(post.posted).toISOString()}>
						<RelativeTimeDynamic date={post.posted} />
					</time>
				{/if}
			</p>
			<div class="flex items-start gap-4 px-6">
				{#if text !== null}
					<p
						class="min-w-0 flex-1 text-base wrap-break-word whitespace-pre-wrap"
					>
						{text}
					</p>
				{/if}
				{#if photo !== null}
					<div
						data-slot="profile-right-now-post-photo"
						class="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted"
					>
						<MediaImage
							src={proxyMediaUrl(photo.thumbnailUrl)}
							alt="Post photo"
							class="size-full rounded-lg"
							imgClass={{ "scale-110 blur-xl": blurred }}
							aspectRatio="1 / 1"
							tone="photo"
							size="sm"
							loading="lazy"
							skeleton
						/>
						{#if blurred}
							<p
								class="absolute inset-0 grid place-items-center text-muted-foreground"
							>
								<EyeSlashIcon weight="fill" class="size-5" />
								<span class="sr-only">May contain nudity</span>
							</p>
						{/if}
					</div>
				{/if}
			</div>
		</Card.Root>
	</section>
{/if}
<RightNowPostReportSheet {report} />
