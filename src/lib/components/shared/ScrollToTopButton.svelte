<script lang="ts">
	import CaretUpIcon from "phosphor-svelte/lib/CaretUpIcon";

	import { t } from "#lib/i18n/index.ts";
	import { answerStatusBarTaps } from "#lib/platform/status-bar-tap.ts";
	import {
		glidingToTop,
		jumpThenGlideToTop,
		stopGlidingToTop,
		TOP_SLOP_PX,
	} from "#lib/util/scroll.ts";
	import { cn } from "#lib/util/utils.ts";
	import ScrollJumpButton from "./ScrollJumpButton.svelte";

	let {
		container,
		text,
		onjump,
		labeled = $bindable(false),
		class: className,
	}: {
		container: HTMLElement | null;
		text?: string;
		onjump?: () => void;
		labeled?: boolean;
		class?: import("svelte/elements").ClassValue;
	} = $props();

	let atTop = $state(true);

	function settle() {
		atTop = (container?.scrollTop ?? 0) <= TOP_SLOP_PX;
	}

	$effect(() => {
		const el = container;
		if (!el) return;

		const onScroll = () => {
			if (!glidingToTop(el)) settle();
		};

		settle();
		el.addEventListener("scroll", onScroll, { passive: true });
		el.addEventListener("scrollend", onScroll, { passive: true });
		const stopAnswering = answerStatusBarTaps({
			scroller: el,
			scrollToTop,
		});
		return () => {
			el.removeEventListener("scroll", onScroll);
			el.removeEventListener("scrollend", onScroll);
			stopAnswering?.();
			stopGlidingToTop(el);
		};
	});

	$effect.pre(() => {
		if (!atTop) labeled = text !== undefined;
	});

	function scrollToTop() {
		const el = container;
		if (!el) return;
		atTop = true;
		onjump?.();
		jumpThenGlideToTop({ element: el });
	}
</script>

{#if !atTop}
	<ScrollJumpButton
		label={text === undefined
			? t("shell.scrollToTopButton.a11y.label")
			: t("shell.scrollToTopButton.a11y.labelWithText", { text })}
		size={labeled ? "lg" : "icon-lg"}
		class={cn("absolute inset-x-0 z-10 mx-auto w-fit", className)}
		onclick={scrollToTop}
		onoutroend={() => (labeled = false)}
	>
		<CaretUpIcon />
		{#if text !== undefined}
			{text}
		{/if}
	</ScrollJumpButton>
{/if}
