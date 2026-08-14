<script lang="ts">
	import "photoswipe/style.css";
	import { ImagesIcon, VideoIcon } from "phosphor-svelte";
	import type PhotoSwipeLightbox from "photoswipe/lightbox";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		type AlbumContentResponse,
		getAlbumContent,
	} from "$lib/api/messaging/albums";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import { proxyMediaUrl } from "$lib/util/media";
	import {
		measureImage,
		measureVideo,
		type MediaDimensions,
	} from "$lib/util/media-dimensions";
	import {
		applyPhotoSwipeBackGesture,
		applyPhotoSwipeErrorUi,
		applyPhotoSwipeVideo,
	} from "$lib/util/photoswipe";
	import type { AlbumMessage } from "$lib/model/messaging/messages";
	import LockedMedia from "./LockedMedia.svelte";
	import { MessageMediaState } from "./message-media.svelte";

	let { message }: { message: AlbumMessage["body"] } = $props();

	const media = new MessageMediaState();

	const className: import("svelte/elements").ClassValue = $derived([
		"aspect-3/4 h-auto relative",
		{
			"ring ring-accent": message.hasUnseenContent,
			"w-2/5 min-w-35 max-w-60 ms-3": !media.clone,
			"size-full": media.clone,
		},
	]);

	const contentClass: import("svelte/elements").ClassValue = $derived([
		"rounded-xl",
		media.cornerClass,
	]);

	type LoadedAlbum = AlbumContentResponse & {
		content: (AlbumContentResponse["content"][number] & MediaDimensions)[];
	};

	type AlbumState =
		| { status: "idle" }
		| { status: "loading" }
		| { status: "open"; album: LoadedAlbum };

	let albumState = $state<AlbumState>({ status: "idle" });
	let cachedAlbum: LoadedAlbum | null = null;

	function openAlbum() {
		if (cachedAlbum) {
			albumState = { status: "open", album: cachedAlbum };
		} else {
			albumState = { status: "loading" };
		}
	}

	$effect(() => {
		if (albumState.status !== "loading") return;
		(async () => {
			const album = await getAlbumContent(message.albumId);
			const loaded = {
				...album,
				content: await Promise.all(
					album.content.map(async (slide) => {
						const isVideo = slide.contentType.startsWith("video/");
						const url = proxyMediaUrl(slide.url, {
							as: isVideo ? "video" : "image",
						});
						return {
							...slide,
							url,
							coverUrl: proxyMediaUrl(slide.coverUrl),
							...(isVideo
								? await measureVideo(url)
								: await measureImage(url)),
						};
					}),
				),
			};
			cachedAlbum = loaded;
			albumState = { status: "open", album: loaded };
		})().catch((error) => {
			console.error(error);
			showErrorToast({ label: "Failed to load album content", error });
			albumState = { status: "idle" };
		});
	});

	$effect(() => {
		if (albumState.status !== "open") return;
		const { album } = albumState;
		let lightbox: PhotoSwipeLightbox | undefined;
		let canceled = false;
		import("photoswipe/lightbox")
			.then(({ default: PhotoSwipeLightbox }) => {
				if (canceled) return;
				lightbox = new PhotoSwipeLightbox({
					showHideAnimationType: "fade",
					pswpModule: () => import("photoswipe"),
					mainClass: `pswp--buttons-visible`,
				});
				applyPhotoSwipeErrorUi(lightbox);
				lightbox.addFilter("numItems", () => album.content.length);
				lightbox.addFilter("itemData", (itemData, index) => {
					const slide = album.content[index];
					if (slide === undefined) return itemData;
					return {
						src: slide.url,
						width: slide.width,
						height: slide.height,
					};
				});
				applyPhotoSwipeBackGesture(lightbox);
				applyPhotoSwipeVideo(lightbox, (index) => {
					const slide = album.content[index];
					if (!slide?.contentType.startsWith("video/")) return null;
					return { src: slide.url, poster: slide.coverUrl };
				});
				lightbox.on("closingAnimationEnd", () => {
					albumState = { status: "idle" };
				});
				lightbox.init();
				lightbox.loadAndOpen(0);
			})
			.catch((error) => {
				console.error(error);
				showErrorToast({ label: "Failed to open album", error });
				albumState = { status: "idle" };
			});
		return () => {
			canceled = true;
			lightbox?.destroy();
			lightbox = undefined;
		};
	});
</script>

{#if message.isViewable}
	<button
		class={[
			className,
			contentClass,
			{
				"cursor-pointer": albumState.status === "idle",
				"opacity-50": albumState.status === "loading",
			},
		]}
		aria-label="Open album"
		onclick={openAlbum}
		disabled={albumState.status !== "idle"}
		{@attach media.attach}
	>
		<MediaImage
			src={proxyMediaUrl(message.coverUrl)}
			class="absolute top-0 left-0 h-full w-full rounded-[inherit]"
			imgClass="bg-card-foreground/10"
		/>
		<div
			class={["@container absolute top-0 left-0 size-full", contentClass]}
		>
			<div
				class="absolute bottom-1/5 left-1/2 flex -translate-x-1/2 items-center gap-1 px-2 py-0.5 *:aspect-square *:w-[20cqw] *:rounded-full *:bg-card *:p-2"
			>
				{#if message.hasPhoto}
					<div>
						<ImagesIcon
							width="100%"
							height="auto"
							weight="fill"
							color="var(--color-neutral-200)"
						/>
					</div>
				{/if}
				{#if message.hasVideo}
					<div>
						<VideoIcon
							width="100%"
							height="auto"
							weight="fill"
							color="var(--color-neutral-200)"
						/>
					</div>
				{/if}
			</div>
		</div>
		{@render media.adornments?.()}
	</button>
{:else}
	<div class={[className, contentClass]} {@attach media.attach}>
		<LockedMedia class={media.cornerClass} />
		{@render media.adornments?.()}
	</div>
{/if}

<style>
	:global(.pswp__img) {
		object-fit: contain;
	}
</style>
