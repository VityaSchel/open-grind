<script lang="ts">
	import "photoswipe/style.css";
	import { ImagesIcon } from "phosphor-svelte";
	import type PhotoSwipeLightbox from "photoswipe/lightbox";

	import { showErrorToast } from "$lib/api/error-toast";
	import { getSingleMessage } from "$lib/api/messaging/messages";
	import {
		type ExpiringImageMessage,
		expiringImageMessageSchema,
	} from "$lib/model/messaging/messages";
	import { proxyMediaUrl } from "$lib/util/media";
	import {
		measureImage,
		type MediaDimensions,
	} from "$lib/util/media-dimensions";
	import {
		applyPhotoSwipeBackGesture,
		applyPhotoSwipeErrorUi,
	} from "$lib/util/photoswipe";
	import LockedMedia from "./LockedMedia.svelte";
	import { MessageMediaState } from "./message-media.svelte";

	let {
		conversationId,
		messageId,
		message,
		isOut,
	}: {
		conversationId: string;
		messageId: string;
		message: ExpiringImageMessage["body"];
		isOut: boolean;
	} = $props();

	const media = new MessageMediaState();

	const className: import("svelte/elements").ClassValue = $derived([
		"relative",
		{ "ms-3": !media.clone, "size-full": media.clone },
	]);

	const contentClass: import("svelte/elements").ClassValue = $derived([
		"rounded-xl",
		media.cornerClass,
	]);

	const bubbleClass: import("svelte/elements").ClassValue = $derived([
		"flex w-50 items-center gap-2 px-4 py-3 text-start font-medium",
		className,
		contentClass,
		"border border-border bg-input",
	]);

	type LoadedImage = { url: string; size: MediaDimensions | null };

	type ImageState =
		| { status: "idle" }
		| { status: "loading" }
		| { status: "open"; image: LoadedImage }
		| { status: "expired" };

	let imageState = $state<ImageState>({ status: "idle" });
	let cachedImage: LoadedImage | null = null;

	const ownUrl = $derived(
		isOut && message.url !== null ? proxyMediaUrl(message.url) : null,
	);

	const viewable = $derived.by(() => {
		if (isOut) {
			return ownUrl !== null;
		} else {
			return (
				imageState.status !== "expired" &&
				message.viewed !== true &&
				message.viewsRemaining !== 0
			);
		}
	});

	function openImage() {
		imageState =
			cachedImage === null
				? { status: "loading" }
				: { status: "open", image: cachedImage };
	}

	async function fetchImageUrl(): Promise<string | null> {
		const { body: image } = await getSingleMessage({
			conversationId,
			messageId,
		}).then((res) => expiringImageMessageSchema.parse(res.message));
		return image.url === null ? null : proxyMediaUrl(image.url);
	}

	$effect(() => {
		if (imageState.status !== "loading") return;
		void (async () => {
			try {
				const url = ownUrl ?? (await fetchImageUrl());
				if (url === null) {
					imageState = { status: "expired" };
					return;
				}
				const size = await measureImage(url).catch(() => null);
				cachedImage = { url, size };
				imageState = { status: "open", image: cachedImage };
			} catch (error) {
				console.error(error);
				showErrorToast({
					label: "Failed to load expiring image",
					error,
				});
				imageState = { status: "idle" };
			}
		})();
	});

	$effect(() => {
		if (imageState.status !== "open") return;
		const { image } = imageState;
		let lightbox: PhotoSwipeLightbox | undefined;
		import("photoswipe/lightbox")
			.then(({ default: PhotoSwipeLightbox }) => {
				lightbox = new PhotoSwipeLightbox({
					showHideAnimationType: "fade",
					pswpModule: () => import("photoswipe"),
					mainClass: `pswp--buttons-visible`,
				});
				applyPhotoSwipeErrorUi(lightbox);
				lightbox.addFilter("numItems", () => 1);
				lightbox.addFilter("itemData", () => ({
					src: image.url,
					width: image.size?.width ?? 0,
					height: image.size?.height ?? 0,
				}));
				lightbox.addFilter(
					"useContentPlaceholder",
					(usePlaceholder) => usePlaceholder && image.size !== null,
				);
				applyPhotoSwipeBackGesture(lightbox);
				lightbox.on("closingAnimationEnd", () => {
					imageState = { status: "idle" };
				});
				lightbox.init();
				lightbox.loadAndOpen(0);
			})
			.catch((error) => {
				console.error(error);
				showErrorToast({
					label: "Failed to open expiring image",
					error,
				});
				imageState = { status: "idle" };
			});
		return () => lightbox?.destroy();
	});
</script>

{#snippet bubbleContent(label: string)}
	<ImagesIcon size={24} weight="fill" />
	<span>{label}</span>
	{@render media.adornments?.()}
{/snippet}

{#if viewable}
	<button
		class={[
			bubbleClass,
			{
				"cursor-pointer": imageState.status === "idle",
				"opacity-50": imageState.status === "loading",
			},
		]}
		onclick={openImage}
		disabled={imageState.status !== "idle"}
		{@attach media.attach}
	>
		{@render bubbleContent("View expiring image")}
	</button>
{:else if isOut}
	<div class={[bubbleClass, "text-muted-foreground"]} {@attach media.attach}>
		{@render bubbleContent("Expiring photo")}
	</div>
{:else}
	<div class={["h-12 w-50", className, contentClass]} {@attach media.attach}>
		<LockedMedia
			class={[media.cornerClass, "gap-2 font-medium text-neutral-600"]}
			size="sm"
		>
			Expired image
		</LockedMedia>
		{@render media.adornments?.()}
	</div>
{/if}

<style>
	:global(.pswp__img) {
		object-fit: contain;
	}
</style>
