<script lang="ts">
	import "photoswipe/style.css";
	import { PlayIcon, VideoIcon } from "phosphor-svelte";
	import { untrack } from "svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import { viewedVideos } from "$lib/chat/viewed-videos.svelte";
	import VideoPreview from "$lib/components/shared/VideoPreview.svelte";
	import {
		type VideoMessage,
		VIEW_ONCE_MAX_VIEWS,
	} from "$lib/model/messaging/messages";
	import { formatMediaDuration } from "$lib/util/format-time";
	import { proxyMediaUrl } from "$lib/util/media";
	import {
		measureVideo,
		type MediaDimensions,
	} from "$lib/util/media-dimensions";
	import LockedMedia from "./LockedMedia.svelte";
	import { MessageMediaState } from "./message-media.svelte";
	import { type LightboxVideo, openVideoLightbox } from "./video-lightbox";

	let { message, isOut }: { message: VideoMessage["body"]; isOut: boolean } =
		$props();

	const UNMEASURED: MediaDimensions = { width: 1080, height: 1920 };

	const media = new MessageMediaState();

	const src = $derived(proxyMediaUrl(message.url, { as: "video" }));
	const viewOnce = $derived(message.maxViews === VIEW_ONCE_MAX_VIEWS);
	const watchedHere = $derived(
		!isOut &&
			viewOnce &&
			message.mediaId !== null &&
			viewedVideos.has(message.mediaId),
	);
	const playable = $derived(
		src !== null &&
			(isOut || (message.viewsRemaining !== 0 && !watchedHere)),
	);

	const label = $derived(viewOnce ? "Expiring video" : "Video");

	type Metadata = { src: string; duration: number } & MediaDimensions;

	let metadata = $state<Metadata | null>(null);
	const measured = $derived(
		metadata !== null && metadata.src === src ? metadata : null,
	);
	const aspectRatio = $derived(
		measured === null || measured.width === 0 || measured.height === 0
			? "3 / 4"
			: `${measured.width} / ${measured.height}`,
	);
	const durationSeconds = $derived(
		message.length > 0 ? message.length / 1000 : (measured?.duration ?? 0),
	);

	type PlayerState =
		| { status: "idle" }
		| { status: "loading" }
		| { status: "open"; video: LightboxVideo };

	let player = $state<PlayerState>({ status: "idle" });

	function play() {
		player = { status: "loading" };
	}

	function closed() {
		if (!isOut && viewOnce && message.mediaId !== null) {
			viewedVideos.add(message.mediaId);
		}
		player = { status: "idle" };
	}

	async function lightboxVideo(url: string): Promise<LightboxVideo> {
		const size =
			measured !== null && measured.width > 0
				? measured
				: await measureVideo(url).catch(() => UNMEASURED);
		return {
			src: url,
			loop: message.looping === true,
			width: size.width,
			height: size.height,
		};
	}

	$effect(() => {
		if (player.status !== "loading" || src === null) return;
		const controller = new AbortController();
		untrack(() => lightboxVideo(src))
			.then((video) => {
				if (controller.signal.aborted) return;
				player = { status: "open", video };
			})
			.catch((error: unknown) => {
				if (controller.signal.aborted) return;
				console.error(error);
				player = { status: "idle" };
			});
		return () => controller.abort();
	});

	$effect(() => {
		if (player.status !== "open") return;
		const { video } = player;
		const controller = new AbortController();
		openVideoLightbox({
			video,
			signal: controller.signal,
			onClosed: closed,
		}).catch((error: unknown) => {
			if (controller.signal.aborted) return;
			console.error(error);
			showErrorToast({ label: "Failed to open video", error });
			player = { status: "idle" };
		});
		return () => controller.abort();
	});

	const bubbleClass: import("svelte/elements").ClassValue = $derived([
		"relative flex w-50 items-center gap-2 rounded-xl border border-border bg-input px-4 py-3 text-start font-medium",
		media.cornerClass,
		{ "ms-3": !media.clone, "size-full": media.clone },
	]);
</script>

{#snippet bubbleContent()}
	<VideoIcon size={24} weight="fill" />
	<span>{label}</span>
	{@render media.adornments?.()}
{/snippet}

{#if playable && src !== null && !viewOnce}
	<div
		class={["relative", { "ms-3 w-2/5 max-w-60 min-w-35": !media.clone }]}
		{@attach media.attach}
	>
		<button
			type="button"
			data-slot="video-message"
			class={[
				"relative block w-full overflow-hidden rounded-lg bg-card-foreground/10",
				media.cornerClass,
				{
					"cursor-pointer": player.status === "idle",
					"opacity-50": player.status === "loading",
				},
			]}
			aria-label="Play video"
			disabled={player.status !== "idle"}
			onclick={play}
		>
			<VideoPreview
				{src}
				class="block w-full"
				{aspectRatio}
				onmetadata={(video) => {
					metadata = {
						src,
						width: video.videoWidth,
						height: video.videoHeight,
						duration: video.duration,
					};
				}}
			/>
			<span class="absolute inset-0 flex items-center justify-center">
				<span
					class="flex size-12 items-center justify-center media-chip text-white backdrop-filter-(--bd-chip)"
				>
					<PlayIcon weight="fill" class="size-5" />
				</span>
			</span>
			{#if durationSeconds > 0}
				<span
					aria-hidden="true"
					class="absolute right-1.5 bottom-1.5 media-chip px-1.5 py-0.5 text-2xs font-semibold text-white tabular-nums backdrop-filter-(--bd-chip)"
				>
					{formatMediaDuration(durationSeconds)}
				</span>
			{/if}
		</button>
		{@render media.adornments?.()}
	</div>
{:else if playable}
	<button
		type="button"
		data-slot="video-message"
		class={[
			bubbleClass,
			{
				"cursor-pointer": player.status === "idle",
				"opacity-50": player.status === "loading",
			},
		]}
		aria-label="Play expiring video"
		disabled={player.status !== "idle"}
		onclick={play}
		{@attach media.attach}
	>
		{@render bubbleContent()}
	</button>
{:else if isOut}
	<div
		data-slot="video-message-unavailable"
		class={[bubbleClass, "text-muted-foreground"]}
		{@attach media.attach}
	>
		{@render bubbleContent()}
	</div>
{:else}
	<div
		data-slot="video-message-unavailable"
		class={[
			"relative h-12 w-50 rounded-xl",
			media.cornerClass,
			{ "ms-3": !media.clone, "size-full": media.clone },
		]}
		{@attach media.attach}
	>
		<LockedMedia
			class={[media.cornerClass, "gap-2 font-medium text-neutral-600"]}
			size="sm"
		>
			Expired video
		</LockedMedia>
		{@render media.adornments?.()}
	</div>
{/if}
