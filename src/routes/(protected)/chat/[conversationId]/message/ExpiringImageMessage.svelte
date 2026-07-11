<script lang="ts">
	import "photoswipe/style.css";
	import { ImagesIcon } from "phosphor-svelte";
	import type PhotoSwipeLightbox from "photoswipe/lightbox";

	import { showErrorToast } from "$lib/api/error";
	import { getSingleMessage } from "$lib/api/messaging/messages";
	import {
		type ExpiringImageMessage,
		expiringImageMessageSchema,
	} from "$lib/model/messaging/messages";
	import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
	import LockedMedia from "../LockedMedia.svelte";
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
		{
			"ms-3": !media.clone,
			"size-full": media.clone,
		},
	]);

	const contentClass: import("svelte/elements").ClassValue = $derived([
		"rounded-xl",
		media.cornerClass,
	]);

	type LoadedImage = { url: string };

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
				cachedImage = { url: image.url };
				imageState = {
					status: "open",
					image: {
						url: image.url,
					},
				};
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
				lightbox.addFilter("numItems", () => 1);
				lightbox.addFilter("itemData", () => {
					return { src: image.url, width: 0, height: 0 };
				});
				const onBackGesture = () => {
					lightbox?.pswp?.close();
					return false;
				};
				lightbox.on("beforeOpen", () => {
					backGestureEventHandlers.add(onBackGesture);
				});
				lightbox.on("close", () => {
					backGestureEventHandlers.delete(onBackGesture);
				});
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
			"px-4 py-3 flex items-center gap-2 font-medium w-50 text-start",
			className,
			contentClass,
			"bg-input border border-border",
			{
				"cursor-pointer": imageState.status === "idle",
				"opacity-50": imageState.status === "loading",
			},
		]}
		onclick={openImage}
		disabled={imageState.status !== "idle"}
		bind:this={media.el}
	>
		<ImagesIcon size={24} weight="fill" />
		<span>View expiring image</span>
		{@render media.adornments?.()}
	</button>
{:else}
	<div
		class={["h-12 w-50 relative", className, contentClass]}
		bind:this={media.el}
	>
		<LockedMedia
			class={[media.cornerClass, "font-medium text-neutral-600 gap-2"]}
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
