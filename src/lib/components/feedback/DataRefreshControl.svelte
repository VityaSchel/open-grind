<script lang="ts">
	import { cubicOut, expoOut } from "svelte/easing";
	import { Tween } from "svelte/motion";
	import { scale, type TransitionConfig } from "svelte/transition";
	import type { ClassValue } from "svelte/elements";

	import { Button } from "$lib/components/ui/button";
	import { cn } from "$lib/util/utils";
	import {
		MAX_SLINGSHOT_TENSION,
		slingshotTension,
	} from "./refresh/disc-math";
	import { fixedHeaderOffset } from "./refresh/fixed-header-offset.svelte";
	import { attachOverscrollPull } from "./refresh/overscroll-adapter";
	import { PullModel } from "./refresh/pull-model.svelte";
	import RefreshDisc from "./refresh/RefreshDisc.svelte";
	import { AT_BOUNDARY_PX } from "./refresh/scroll-chain";
	import { scrollGeometry } from "./refresh/scroll-geometry";
	import { attachTouchPull } from "./refresh/touch-adapter";

	let {
		updating,
		position,
		container,
		hintOffset = 0,
		containerClass,
		onrefresh,
	}: {
		updating?: boolean;
		position: "top" | "bottom";
		container?: HTMLElement | null;
		hintOffset?: number;
		containerClass?: ClassValue;
		onrefresh?: () => void;
	} = $props();

	const BUTTON_HEIGHT_PX = 32;
	const REST_GAP_PX = 12;
	const REST_HEIGHT_PX = BUTTON_HEIGHT_PX + REST_GAP_PX * 2;
	const ARM_PX = 18;
	const BAND_DETECT_PX = 2;
	const BOUNDARY_SETTLE_MS = 50;
	const MOUSE_PROBE_MS = BOUNDARY_SETTLE_MS + 70;
	const REVEAL_TRANSITION: TransitionConfig = {
		duration: 250,
		easing: expoOut,
	};

	const mounted = $derived(!!container);
	let restingButtonShown = $state(false);
	let distance = $state(Infinity);
	const headerOffset = fixedHeaderOffset({
		container: () => container,
		enabled: () => position === "top",
	});

	let onlyMouseSeen = $state(false);
	let sawBand = false;

	const reveal = new Tween(0, REVEAL_TRANSITION);
	const model = new PullModel();
	model.space = ARM_PX;

	const busy = $derived((updating ?? false) || model.phase === "refreshing");

	$effect(() => {
		model.setUpdating(updating ?? false);
	});
	model.onTrigger = () => onrefresh?.();
	model.getBaseline = () => (restingButtonShown ? REST_HEIGHT_PX : 0);

	type IndicatorType = "disc" | "hint" | "button";
	const activeFace = $derived.by((): IndicatorType | null => {
		if (busy) return "disc";
		if (model.gestureActive)
			return model.source === "touch" ? "disc" : "hint";
		if (restingButtonShown) return "button";
		return null;
	});
	let lingerFace: IndicatorType | null = $state(null);
	$effect(() => {
		if (activeFace) lingerFace = activeFace;
	});

	const DISC_SIZE = 40;
	const DISC_SHADOW = 8;
	const DISC_START = -(DISC_SIZE + DISC_SHADOW);
	const DISC_REST = 10;
	const DISC_TRAVEL = DISC_REST - DISC_START;
	const DISC_WINDOW = DISC_REST + DISC_TRAVEL + DISC_SIZE + DISC_SHADOW;
	const discTop = new Tween(DISC_START, { duration: 250, easing: cubicOut });
	let discOutro = $state(false);

	function discDragTop(displayPx: number): number {
		const drag = Math.min(1, displayPx / ARM_PX);
		const tension = slingshotTension(displayPx / ARM_PX);
		return (
			DISC_START + DISC_TRAVEL * (drag + tension / MAX_SLINGSHOT_TENSION)
		);
	}

	const discShown = $derived.by(() => {
		if (activeFace) return activeFace === "disc";
		return (
			lingerFace === "disc" &&
			model.settledOutcome === "canceled" &&
			discTop.current > DISC_START + 0.5
		);
	});
	const hintShown = $derived.by(() => {
		if (activeFace) return activeFace === "hint";
		return (
			lingerFace === "hint" &&
			model.settledOutcome === "canceled" &&
			reveal.current > 0
		);
	});
	const hintMayOverflowBand = $derived(hintShown);
	const buttonShown = $derived.by(() => {
		if (activeFace) return activeFace === "button";
		return lingerFace === "button" && reveal.current > 0;
	});

	const discSpinning = $derived(
		busy || (!model.gestureActive && model.settledOutcome === "triggered"),
	);
	let lastDragProgress = $state(0);
	$effect(() => {
		if (model.gestureActive && model.source === "touch")
			lastDragProgress = model.displayPx / ARM_PX;
	});
	$effect(() => {
		if (busy && model.settledFrom !== "touch") lastDragProgress = 0;
	});
	const discProgress = $derived(
		model.gestureActive && model.source === "touch"
			? model.displayPx / ARM_PX
			: lastDragProgress,
	);

	$effect(() => {
		if (model.gestureActive && model.source === "touch") {
			void discTop.set(discDragTop(model.displayPx), { duration: 0 });
		} else if (busy) {
			void discTop.set(DISC_REST);
		} else if (discShown) {
			void discTop.set(DISC_START);
		}
	});

	const discVisible = $derived(discShown || discOutro);
	const overlayHeight = $derived(discVisible ? DISC_WINDOW : reveal.current);
	const opacity = $derived.by(() => {
		if (discVisible) {
			return 1;
		} else if (hintShown) {
			return Math.min(
				1,
				Math.max(0, (reveal.current / ARM_PX) * 1.2 - 0.2),
			);
		} else {
			return Math.min(
				1,
				Math.max(0, (reveal.current / REST_HEIGHT_PX) * 1.6 - 0.2),
			);
		}
	});
	const geometry = scrollGeometry({
		container: () => container,
		position: () => position,
	});
	const { overscrollPx, boundaryDistance } = geometry;

	export function scrollToRest(behavior: ScrollBehavior = "instant") {
		geometry.scrollToRest(behavior);
	}

	$effect(() => {
		if (model.gestureActive && model.source === "overscroll") {
			void reveal.set(model.displayPx, { duration: 0 });
		} else if (!model.gestureActive) {
			void reveal.set(busy || restingButtonShown ? REST_HEIGHT_PX : 0);
		}
	});

	const shouldRevealRestingButton = () =>
		onlyMouseSeen &&
		!restingButtonShown &&
		!busy &&
		!model.gestureActive &&
		distance < AT_BOUNDARY_PX;

	const shouldConcealRestingButton = () =>
		restingButtonShown &&
		!model.gestureActive &&
		distance >= AT_BOUNDARY_PX;
	$effect(() => {
		if (shouldRevealRestingButton()) restingButtonShown = true;
	});

	$effect(() => {
		const target = container;
		if (!target) return;

		let mouseProbe: ReturnType<typeof setTimeout> | undefined;
		const onWheel = (event: WheelEvent) => {
			if (sawBand || onlyMouseSeen) return;
			const toward = position === "top" ? -event.deltaY : event.deltaY;
			if (toward <= 0 || boundaryDistance() >= AT_BOUNDARY_PX) return;
			clearTimeout(mouseProbe);
			mouseProbe = setTimeout(() => {
				if (!sawBand) onlyMouseSeen = true;
			}, MOUSE_PROBE_MS);
		};

		const onScroll = () => {
			if (overscrollPx() > BAND_DETECT_PX) {
				sawBand = true;
				onlyMouseSeen = false;
				restingButtonShown = false;
			}
			if (
				!model.gestureActive &&
				!busy &&
				model.settledFrom === "overscroll" &&
				model.settledOutcome === "canceled" &&
				reveal.current > 0
			) {
				void reveal.set(Math.max(0, overscrollPx()), { duration: 0 });
			}
			distance = boundaryDistance();
			if (shouldRevealRestingButton()) restingButtonShown = true;
			else if (shouldConcealRestingButton()) restingButtonShown = false;
		};

		target.addEventListener("scroll", onScroll, { passive: true });
		target.addEventListener("wheel", onWheel as EventListener, {
			passive: true,
		});
		distance = boundaryDistance();
		return () => {
			target.removeEventListener("scroll", onScroll);
			target.removeEventListener("wheel", onWheel as EventListener);
			clearTimeout(mouseProbe);
		};
	});

	$effect(() => {
		const listenTarget = container;
		if (!listenTarget) return;
		const scrollRoot = () => container ?? null;
		// Without this the touch drag freezes: PullModel resists across
		// space * OVERSHOOT minus the baseline, leaving no range to move through.
		const noteTouch = () => {
			sawBand = true;
			onlyMouseSeen = false;
			restingButtonShown = false;
		};
		listenTarget.addEventListener("touchmove", noteTouch, {
			passive: true,
		});
		const detach = [
			attachTouchPull(model, {
				listenTarget,
				scrollRoot,
				boundaryDistance,
				position,
			}),
			attachOverscrollPull(model, { listenTarget, overscrollPx }),
		];
		return () => {
			listenTarget.removeEventListener("touchmove", noteTouch);
			detach.forEach((cleanup) => cleanup());
		};
	});

	$effect(() => {
		if (model.phase !== "refreshing" || updating) return;
		const timer = setTimeout(
			() => model.finishRefresh(),
			model.remainingRefreshMs(),
		);
		return () => clearTimeout(timer);
	});
</script>

{#if mounted}
	<div
		data-refresh-phase={model.phase}
		data-refresh-source={model.source}
		class={cn(
			"pointer-events-none z-10",
			{ "overflow-clip": !hintMayOverflowBand },
			"absolute inset-x-0",
			{
				"top-(--drc-anchor)": position === "top",
				"bottom-(--drc-anchor)": position === "bottom",
			},
			containerClass,
		)}
		style:--drc-anchor="{headerOffset.px}px"
		style:height="{overlayHeight}px"
		style:opacity
	>
		{#if discShown}
			<div
				class={[
					"absolute left-1/2",
					{
						"top-0": position === "top",
						"bottom-0": position === "bottom",
					},
				]}
				style:translate="-50% {position === 'top'
					? discTop.current
					: -discTop.current}px"
				out:scale={{ duration: 150, easing: cubicOut }}
				onoutrostart={() => (discOutro = true)}
				onoutroend={() => {
					discOutro = false;
					void discTop.set(DISC_START, { duration: 0 });
				}}
			>
				<RefreshDisc progress={discProgress} spinning={discSpinning} />
			</div>
		{:else if hintShown}
			<span
				class={[
					"absolute left-1/2 text-xs whitespace-nowrap text-muted-foreground",
					{
						"bottom-1": position === "top",
						"top-1": position === "bottom",
					},
				]}
				style:translate="-50% {position === 'top'
					? hintOffset
					: -hintOffset}px"
			>
				{#if model.phase === "armed"}
					Release to refresh
				{:else}
					Pull to refresh
				{/if}
			</span>
		{:else if buttonShown}
			<div
				class={[
					"absolute left-1/2 -translate-x-1/2",
					{
						"bottom-3": position === "top",
						"top-3": position === "bottom",
					},
				]}
			>
				{@render button()}
			</div>
		{/if}
	</div>
{/if}

{#snippet button()}
	<Button
		size="sm"
		class="pointer-events-auto h-(--height) w-25 backdrop-blur-2xl"
		style="--height: {BUTTON_HEIGHT_PX}px;"
		onclick={() => model.clickTrigger()}
	>
		Refresh
	</Button>
{/snippet}
