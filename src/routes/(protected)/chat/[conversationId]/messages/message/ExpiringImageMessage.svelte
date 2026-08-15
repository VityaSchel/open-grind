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
		applyPhotoSwipeBackGesture,
		applyPhotoSwipeErrorUi,
	} from "$lib/util/photoswipe";
	import LockedMedia from "./LockedMedia.svelte";
	import { MessageMediaState } from "./message-media.svelte";

	let {
		conversationId,
		messageId,
		message,
	}: {
		conversationId: string;
		messageId: string;
		message: ExpiringImageMessage["body"];
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

	type LoadedImage = {
		url: string;
		width: number | null;
		height: number | null;
	};

	type ImageState =
		| { status: "idle" }
		| { status: "loading" }
		| { status: "open"; image: LoadedImage };

	let imageState = $state<ImageState>({ status: "idle" });
	let cachedImage: LoadedImage | null = null;

	function openImage() {
		if (cachedImage) {
			imageState = { status: "open", image: cachedImage };
		} else {
			imageState = { status: "loading" };
		}
	}

	$effect(() => {
		if (imageState.status !== "loading") return;
		void (async () => {
			try {
				const { body: image } = await getSingleMessage({
					conversationId,
					messageId,
				}).then((res) => expiringImageMessageSchema.parse(res.message));
				if (image.url === null) throw new Error("Image URL is null");
				cachedImage = {
					url: proxyMediaUrl(image.url),
					width: image.width,
					height: image.height,
				};
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
		const hasDimensions = image.width !== null && image.height !== null;
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
					width: image.width ?? 0,
					height: image.height ?? 0,
				}));
				lightbox.addFilter(
					"useContentPlaceholder",
					(usePlaceholder) => usePlaceholder && hasDimensions,
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

{#if message.viewsRemaining === null || message.viewsRemaining > 0}
	<button
		class={[
			"flex w-50 items-center gap-2 px-4 py-3 text-start font-medium",
			className,
			contentClass,
			"border border-border bg-input",
			{
				"cursor-pointer": imageState.status === "idle",
				"opacity-50": imageState.status === "loading",
			},
		]}
		onclick={openImage}
		disabled={imageState.status !== "idle"}
		{@attach media.attach}
	>
		<ImagesIcon size={24} weight="fill" />
		<span>View expiring image</span>
		{@render media.adornments?.()}
	</button>
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
