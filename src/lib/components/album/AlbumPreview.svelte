<script lang="ts">
	import "photoswipe/style.css";
	import { ImagesIcon, VideoIcon } from "phosphor-svelte";
	import type { Snippet } from "svelte";
	import type { Attachment } from "svelte/attachments";
	import type { ClassValue } from "svelte/elements";

	import { showErrorToast } from "$lib/api/error-toast";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import { proxyMediaUrl } from "$lib/util/media";
	import {
		type AlbumSlide,
		loadAlbumSlides,
		openAlbumLightbox,
	} from "./album-lightbox";

	let {
		albumId,
		coverUrl,
		hasPhoto,
		hasVideo,
		label = "Open album",
		class: className,
		contentClass,
		attach = () => {},
		children,
	}: {
		albumId: number;
		coverUrl: string | null;
		hasPhoto: boolean;
		hasVideo: boolean;
		label?: string;
		class?: ClassValue;
		contentClass?: ClassValue;
		attach?: Attachment<HTMLElement>;
		children?: Snippet;
	} = $props();

	type PreviewState =
		| { status: "idle" }
		| { status: "loading" }
		| { status: "open"; slides: AlbumSlide[] };

	let state = $state<PreviewState>({ status: "idle" });

	function open() {
		state = { status: "loading" };
	}

	$effect(() => {
		if (state.status !== "loading") return;
		const controller = new AbortController();
		loadAlbumSlides(albumId)
			.then((slides) => {
				if (controller.signal.aborted) return;
				state = { status: "open", slides };
			})
			.catch((error: unknown) => {
				if (controller.signal.aborted) return;
				console.error(error);
				showErrorToast({
					label: "Failed to load album content",
					error,
				});
				state = { status: "idle" };
			});
		return () => controller.abort();
	});

	$effect(() => {
		if (state.status !== "open") return;
		const { slides } = state;
		const controller = new AbortController();
		openAlbumLightbox({
			slides,
			signal: controller.signal,
			onClosed: () => (state = { status: "idle" }),
		}).catch((error: unknown) => {
			if (controller.signal.aborted) return;
			console.error(error);
			showErrorToast({ label: "Failed to open album", error });
			state = { status: "idle" };
		});
		return () => controller.abort();
	});
</script>

<button
	data-slot="album-preview"
	class={[
		"relative",
		className,
		contentClass,
		{
			"cursor-pointer": state.status === "idle",
			"opacity-50": state.status === "loading",
		},
	]}
	aria-label={label}
	onclick={open}
	disabled={state.status !== "idle"}
	{@attach attach}
>
	<MediaImage
		src={proxyMediaUrl(coverUrl)}
		class="absolute top-0 left-0 h-full w-full rounded-[inherit]"
		imgClass="bg-card-foreground/10"
	/>
	<div class={["@container absolute top-0 left-0 size-full", contentClass]}>
		<div
			class="absolute bottom-1/5 left-1/2 flex -translate-x-1/2 items-center gap-1 px-2 py-0.5 *:aspect-square *:w-[24cqw] *:rounded-full *:bg-card *:p-[6cqw]"
		>
			{#if hasPhoto}
				<div>
					<ImagesIcon
						width="100%"
						height="auto"
						weight="fill"
						color="var(--color-neutral-200)"
					/>
				</div>
			{/if}
			{#if hasVideo}
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
	{@render children?.()}
</button>

<style>
	:global(.pswp__img) {
		object-fit: contain;
	}
</style>
