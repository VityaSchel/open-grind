<script lang="ts">
	import "photoswipe/style.css";
	import { VideoCameraIcon } from "phosphor-svelte";
	import { untrack } from "svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import { getSingleMessage } from "$lib/api/messaging/messages";
	import { proxyMediaUrl } from "$lib/util/media";
	import {
		measureVideo,
		type MediaDimensions,
	} from "$lib/util/media-dimensions";
	import { openLightbox } from "$lib/util/photoswipe";
	import type { VideoMessage } from "$lib/model/messaging/messages";
	import { MessageMediaState } from "./message-media.svelte";

	type VideoBody = VideoMessage["body"];

	type LightboxVideo = { src: string; loop: boolean } & MediaDimensions;

	let {
		conversationId,
		messageId,
		message,
		delivered,
	}: {
		conversationId: string;
		messageId: string;
		message: VideoBody;
		delivered: boolean;
	} = $props();

	const UNMEASURED: MediaDimensions = { width: 1080, height: 1920 };

	const media = new MessageMediaState();

	let viewsRemaining = $derived(message.viewsRemaining ?? 0);

	const playable = $derived(delivered && viewsRemaining > 0);

	type PlayerState =
		| { status: "idle" }
		| { status: "loading" }
		| { status: "open"; video: LightboxVideo; viewsLeft: number };

	let player = $state<PlayerState>({ status: "idle" });

	type RefetchedVideo = { video: LightboxVideo; viewsLeft: number };

	function play() {
		player = { status: "loading" };
	}

	function finishPlayback(viewsLeft: number) {
		viewsRemaining = viewsLeft;
		player = { status: "idle" };
	}

	async function refetchVideo(): Promise<RefetchedVideo | null> {
		const { message: refetched } = await getSingleMessage({
			conversationId,
			messageId,
		});
		if (refetched.type !== "Video" && refetched.type !== "PrivateVideo") {
			throw new Error(`Expected a video message, got ${refetched.type}`);
		}
		const src = proxyMediaUrl(refetched.body.url, { as: "video" });
		if (src === null) return null;
		const size = await measureVideo(src).catch(() => UNMEASURED);
		return {
			video: {
				src,
				loop: refetched.body.looping === true,
				width: size.width,
				height: size.height,
			},
			viewsLeft: refetched.body.viewsRemaining ?? 0,
		};
	}

	$effect(() => {
		if (player.status !== "loading") return;
		const controller = new AbortController();
		untrack(refetchVideo)
			.then((refetched) => {
				if (controller.signal.aborted) return;
				if (refetched === null) {
					finishPlayback(0);
					return;
				}
				player = { status: "open", ...refetched };
			})
			.catch((error: unknown) => {
				if (controller.signal.aborted) return;
				console.error(error);
				showErrorToast({
					label: "Failed to load expiring video",
					error,
				});
				player = { status: "idle" };
			});
		return () => controller.abort();
	});

	$effect(() => {
		if (player.status !== "open") return;
		const { video, viewsLeft } = player;
		const controller = new AbortController();
		openLightbox({
			items: [video],
			videoAt: () => ({ src: video.src, poster: null, loop: video.loop }),
			signal: controller.signal,
			onClosed: () => finishPlayback(viewsLeft),
		}).catch((error: unknown) => {
			if (controller.signal.aborted) return;
			console.error(error);
			showErrorToast({ label: "Failed to open expiring video", error });
			finishPlayback(viewsLeft);
		});
		return () => controller.abort();
	});

	const bubbleClass: import("svelte/elements").ClassValue = $derived([
		"relative flex w-fit items-center gap-2 rounded-xl border border-border bg-input px-4 py-3 text-start font-medium",
		media.cornerClass,
		{ "ms-3": !media.clone, "size-full": media.clone },
	]);
</script>

{#snippet bubbleContent()}
	<VideoCameraIcon size={24} weight="fill" class="shrink-0" />
	<span>Expiring video</span>
	{@render media.adornments?.()}
{/snippet}

{#if playable}
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
{:else}
	<div
		data-slot={delivered ? "video-message-spent" : "video-message-sending"}
		class={[bubbleClass, { "text-muted-foreground": delivered }]}
		{@attach media.attach}
	>
		{@render bubbleContent()}
	</div>
{/if}
