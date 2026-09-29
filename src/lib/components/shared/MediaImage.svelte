<script lang="ts">
	import { onDestroy, untrack } from "svelte";
	import type { Attachment } from "svelte/attachments";

	import { Skeleton } from "$lib/components/ui/skeleton";
	import {
		explainsMediaFailures,
		mediaFailure,
		remedyFor,
	} from "$lib/platform/media-failure";
	import { now } from "$lib/util/clock";
	import {
		loadWhenVisible,
		TRANSPARENT_PIXEL,
	} from "$lib/util/load-when-visible";
	import { retryMediaSrc } from "$lib/util/media";
	import {
		acquireMediaLoadSlot,
		releaseWhenSettled,
	} from "$lib/util/media-load-slots";
	import { probeMedia } from "$lib/util/media-probe";
	import { mediaRetry } from "$lib/util/media-retry.svelte";
	import BrokenMedia from "./BrokenMedia.svelte";

	let {
		src,
		alt = "",
		class: className,
		imgClass,
		aspectRatio,
		fallbackAspectRatio = "3 / 4",
		tone = "muted",
		size = "sm",
		loading,
		pending = false,
		failedSrc = $bindable(null),
		onload,
		onexpired,
	}: {
		src: string | null;
		alt?: string;
		class?: import("svelte/elements").ClassValue;
		imgClass?: import("svelte/elements").ClassValue;
		aspectRatio?: string;
		fallbackAspectRatio?: string;
		tone?: "muted" | "photo";
		size?: "xs" | "sm" | "md" | "lg" | "xl";
		loading?: "eager" | "lazy";
		pending?: boolean;
		failedSrc?: string | null;
		onload?: (image: HTMLImageElement) => void;
		onexpired?: () => Promise<void>;
	} = $props();

	const RETRY_DELAY_MS = 2000;
	const MAX_REARMS = 3;
	const REARM_SPACING_MS = 30 * 1000;

	let armed = $state(false);
	const deferred = $derived(loading === "lazy" && !armed);

	let recovery = $state<{
		src: string;
		retrying: boolean;
		attempt: number;
	} | null>(null);
	const recovering = $derived(recovery?.src === src ? recovery : null);
	const loadSrc = $derived(
		recovering?.retrying && src !== null
			? retryMediaSrc({ src, attempt: recovering.attempt })
			: src,
	);
	const requested = $derived(
		pending ||
			deferred ||
			failedSrc === src ||
			recovering?.retrying === false
			? null
			: loadSrc,
	);

	type Stalled = {
		src: string;
		attempts: number;
		at: number;
		generation: number;
	};

	let retryTimer: ReturnType<typeof setTimeout> | undefined;
	let renewedSinceLoad = false;
	let stalled = $state<Stalled | null>(null);
	let brokenVisible = $state(false);
	let probe: { src: string; controller: AbortController } | null = null;
	let handedSlot: (() => void) | null = null;
	let rearmTimer: ReturnType<typeof setTimeout> | undefined;
	onDestroy(() => {
		clearTimeout(retryTimer);
		clearTimeout(rearmTimer);
		probe?.controller.abort();
		handedSlot?.();
	});

	async function recover(failed: string): Promise<void> {
		if (!explainsMediaFailures()) {
			failedSrc = failed;
			return;
		}
		const retried = recovering?.retrying === true;
		recovery = { src: failed, retrying: false, attempt: 1 };
		const remedy = remedyFor(await mediaFailure(failed));
		if (src !== failed) return;
		if (remedy === "retry" && !retried) {
			retryTimer = setTimeout(() => {
				if (src === failed)
					recovery = { src: failed, retrying: true, attempt: 1 };
			}, RETRY_DELAY_MS);
			return;
		}
		if (remedy === "renew" && onexpired && !renewedSinceLoad) {
			renewedSinceLoad = true;
			await onexpired();
		}
		if (src !== failed) return;
		failedSrc = failed;
		stalled =
			remedy === "retry"
				? {
						src: failed,
						attempts:
							stalled?.src === failed ? stalled.attempts : 0,
						at: now(),
						generation: mediaRetry.generation,
					}
				: null;
	}

	function rearm(): void {
		const pause = stalled;
		if (pause === null || pause.src !== src || failedSrc !== src) return;
		if (probe !== null && probe.src !== src) {
			probe.controller.abort();
			probe = null;
		}
		if (!brokenVisible || probe !== null) return;
		if (pause.attempts >= MAX_REARMS) return;
		if (pause.generation === mediaRetry.generation) return;
		const wait = REARM_SPACING_MS - (now() - pause.at);
		if (wait > 0) {
			clearTimeout(rearmTimer);
			rearmTimer = setTimeout(rearm, wait);
			return;
		}
		const attempt = pause.attempts + 2;
		stalled = {
			src: pause.src,
			attempts: pause.attempts + 1,
			at: now(),
			generation: mediaRetry.generation,
		};
		const controller = new AbortController();
		probe = { src: pause.src, controller };
		void probeMedia({
			src: retryMediaSrc({ src: pause.src, attempt }),
			signal: controller.signal,
		}).then((slot) => {
			if (probe?.controller === controller) probe = null;
			if (slot === null) return;
			if (controller.signal.aborted || src !== pause.src) return slot();
			handedSlot = slot;
			recovery = { src: pause.src, retrying: true, attempt };
			failedSrc = null;
		});
	}

	$effect(() => {
		void mediaRetry.generation;
		untrack(rearm);
	});

	const watchBrokenTile: Attachment<HTMLElement> = (node) => {
		if (typeof IntersectionObserver === "undefined") {
			brokenVisible = true;
			return () => (brokenVisible = false);
		}
		const observer = new IntersectionObserver((entries) => {
			brokenVisible = entries.at(-1)?.isIntersecting ?? false;
			if (brokenVisible) rearm();
		});
		observer.observe(node);
		return () => {
			observer.disconnect();
			brokenVisible = false;
		};
	};

	let slotGranted = $state(false);
	let shownSrc = $state<string | null>(null);
	let imageElement = $state<HTMLImageElement>();
	let releaseSlot = () => {};

	$effect.pre(() => {
		slotGranted = false;
		if (requested === null) return;
		const handed = handedSlot;
		handedSlot = null;
		const release =
			handed ?? acquireMediaLoadSlot(() => (slotGranted = true));
		if (handed !== null) slotGranted = true;
		releaseSlot = release;
		return () => {
			if (imageElement?.isConnected === false && !imageElement.complete)
				releaseWhenSettled({ image: imageElement, release });
			else release();
		};
	});
</script>

{#if pending || src === null}
	<Skeleton
		data-slot={pending ? "media-image-pending" : "empty-media"}
		role={alt === "" ? undefined : "img"}
		aria-label={alt === "" ? undefined : alt}
		class={["rounded-none", { "animate-none": !pending }, className]}
	/>
{:else if failedSrc !== src}
	<img
		bind:this={imageElement}
		src={slotGranted ? loadSrc : (shownSrc ?? TRANSPARENT_PIXEL)}
		{alt}
		{loading}
		use:loadWhenVisible={deferred ? () => (armed = true) : undefined}
		draggable="false"
		class={["object-cover", className, imgClass]}
		style:aspect-ratio={aspectRatio}
		onerror={() => {
			if (!slotGranted) return;
			releaseSlot();
			if (src !== null) void recover(src);
		}}
		onload={(event) => {
			const image = event.currentTarget;
			if (!(image instanceof HTMLImageElement)) return;
			if (!slotGranted || image.src === TRANSPARENT_PIXEL) return;
			releaseSlot();
			if (image.naturalWidth === 0) {
				failedSrc = src;
				return;
			}
			shownSrc = loadSrc;
			renewedSinceLoad = false;
			stalled = null;
			onload?.(image);
		}}
	/>
{:else}
	<BrokenMedia
		{tone}
		{size}
		class={className}
		aspectRatio={aspectRatio ?? fallbackAspectRatio}
		label={alt === "" ? undefined : alt}
		attach={watchBrokenTile}
	/>
{/if}
