<script lang="ts">
	import emblaCarouselSvelte from "embla-carousel-svelte";
	import type { EmblaCarouselType, EmblaOptionsType } from "embla-carousel";

	import { cn, type WithElementRef } from "$lib/util/utils.js";

	let {
		ref = $bindable(null),
		value = $bindable(0),
		min = 0,
		max = 23,
		loop = false,
		label,
		disabled = false,
		class: className,
	}: WithElementRef<{
		value?: number;
		min?: number;
		max?: number;
		loop?: boolean;
		label?: string;
		disabled?: boolean;
		class?: string;
	}> = $props();

	const CIRCLE_DEGREES = 360;
	const WHEEL_ITEM_SIZE = 30;
	const WHEEL_ITEM_COUNT = 18;
	const WHEEL_ITEMS_IN_VIEW = 4;

	const WHEEL_ITEM_RADIUS = CIRCLE_DEGREES / WHEEL_ITEM_COUNT;
	const IN_VIEW_DEGREES = WHEEL_ITEM_RADIUS * WHEEL_ITEMS_IN_VIEW;
	const WHEEL_RADIUS = Math.round(
		WHEEL_ITEM_SIZE / 2 / Math.tan(Math.PI / WHEEL_ITEM_COUNT),
	);

	const items = $derived(
		Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i),
	);
	const slideCount = $derived(items.length);

	const clampIndex = (i: number) =>
		Number.isFinite(i) ? Math.max(0, Math.min(slideCount - 1, i)) : 0;

	let emblaApi = $state<EmblaCarouselType>();

	const options: EmblaOptionsType = $derived({
		loop,
		axis: "y",
		dragFree: true,
		containScroll: false,
		watchSlides: false,
		watchResize: false,
		active: !disabled,
		startIndex: clampIndex(value - min),
	});

	const slideInView = (wheelLocation: number, slidePosition: number) =>
		Math.abs(wheelLocation - slidePosition) < IN_VIEW_DEGREES;

	function rotateSlide(
		api: EmblaCarouselType,
		index: number,
		totalRadius: number,
	) {
		const slide = api.slideNodes()[index];
		const snap = api.scrollSnapList()[index];
		if (!slide || snap === undefined) return;
		const wheelLocation = api.scrollProgress() * totalRadius;
		const positionDefault = snap * totalRadius;
		const positionLoopStart = positionDefault + totalRadius;
		const positionLoopEnd = positionDefault - totalRadius;

		let inView = false;
		let angle = index * -WHEEL_ITEM_RADIUS;

		if (slideInView(wheelLocation, positionDefault)) inView = true;

		if (loop && slideInView(wheelLocation, positionLoopEnd)) {
			inView = true;
			angle = -CIRCLE_DEGREES + (slideCount - index) * WHEEL_ITEM_RADIUS;
		}

		if (loop && slideInView(wheelLocation, positionLoopStart)) {
			inView = true;
			angle = -(totalRadius % CIRCLE_DEGREES) - index * WHEEL_ITEM_RADIUS;
		}

		if (inView) {
			slide.style.opacity = "1";
			slide.style.transform = `translateY(-${index * 100}%) rotateX(${angle}deg) translateZ(${WHEEL_RADIUS}px)`;
		} else {
			slide.style.opacity = "0";
			slide.style.transform = "none";
		}
	}

	function rotate(api: EmblaCarouselType) {
		const totalRadius = slideCount * WHEEL_ITEM_RADIUS;
		const rotationOffset = loop ? 0 : WHEEL_ITEM_RADIUS;
		const wheelRotation =
			(slideCount * WHEEL_ITEM_RADIUS - rotationOffset) *
			api.scrollProgress();

		api.containerNode().style.transform = `translateZ(${WHEEL_RADIUS}px) rotateX(${wheelRotation}deg)`;

		for (let index = 0; index < slideCount; index += 1) {
			rotateSlide(api, index, totalRadius);
		}
	}

	function inactivateEmblaTransform(api: EmblaCarouselType) {
		const { translate, slideLooper } = api.internalEngine();
		translate.clear();
		translate.toggleActive(false);
		slideLooper.loopPoints.forEach((point) => {
			point.translate.clear();
			point.translate.toggleActive(false);
		});
	}

	function onInit(event: CustomEvent<EmblaCarouselType>) {
		const api = event.detail;
		emblaApi = api;

		api.on("pointerUp", () => {
			const { scrollTo, target, location } = api.internalEngine();
			const displacement = target.get() - location.get();
			const factor =
				Math.abs(displacement) < WHEEL_ITEM_SIZE / 2.5 ? 10 : 0.1;
			scrollTo.distance(displacement * factor, true);
		});

		api.on("scroll", () => rotate(api));

		api.on("select", () => {
			value = min + api.selectedScrollSnap();
		});

		api.on("reInit", () => {
			inactivateEmblaTransform(api);
			rotate(api);
		});

		inactivateEmblaTransform(api);
		rotate(api);
	}

	$effect(() => {
		if (!emblaApi) return;
		const target = clampIndex(value - min);
		if (emblaApi.selectedScrollSnap() !== target) emblaApi.scrollTo(target);
	});
</script>

<div
	bind:this={ref}
	data-slot="wheel-picker"
	role="slider"
	aria-valuenow={value}
	aria-valuemin={min}
	aria-valuemax={max}
	aria-label={label}
	aria-disabled={disabled}
	class={cn(
		"relative mx-auto flex h-44 w-full touch-pan-x items-center justify-center overflow-hidden select-none",
		disabled && "pointer-events-none opacity-50",
		className,
	)}
>
	<div
		class="h-8 w-full touch-pan-x overflow-visible overscroll-contain [-webkit-tap-highlight-color:transparent] perspective-[1000px]"
		use:emblaCarouselSvelte={{ options, plugins: [] }}
		onemblaInit={onInit}
	>
		<div class="h-full w-full will-change-transform transform-3d">
			{#each items as item (item)}
				<div
					class="flex h-full w-full items-center justify-center text-center text-lg font-medium tabular-nums opacity-0 backface-hidden"
				>
					{item}
				</div>
			{/each}
		</div>
	</div>

	<div
		class="pointer-events-none absolute inset-x-0 top-0 z-10 h-[calc(50%-1rem)] border-b border-border bg-linear-to-t from-background/65 to-background"
	></div>
	<div
		class="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[calc(50%-1rem)] border-t border-border bg-linear-to-b from-background/65 to-background"
	></div>

	{#if label}
		<span
			class="pointer-events-none absolute top-1/2 left-1/2 z-10 translate-x-8 -translate-y-1/2 text-lg font-semibold text-muted-foreground"
		>
			{label}
		</span>
	{/if}
</div>
