<script lang="ts">
	import CaretUpIcon from "phosphor-svelte/lib/CaretUpIcon";

	import { cn } from "$lib/util/utils";
	import ScrollJumpButton from "./ScrollJumpButton.svelte";

	let {
		container,
		class: className,
	}: {
		container: HTMLElement | null;
		class?: import("svelte/elements").ClassValue;
	} = $props();

	const TOP_SLOP_PX = 16;
	const GLIDE_TIMEOUT_MS = 1500;

	let atTop = $state(true);
	let gliding = false;
	let glideTimer: ReturnType<typeof setTimeout> | undefined;

	function releaseGlide() {
		gliding = false;
		clearTimeout(glideTimer);
	}

	function settle() {
		releaseGlide();
		atTop = (container?.scrollTop ?? 0) <= TOP_SLOP_PX;
	}

	$effect(() => {
		const el = container;
		if (!el) return;

		const onScroll = () => {
			if (!gliding || el.scrollTop <= 1) settle();
		};

		settle();
		el.addEventListener("scroll", onScroll, { passive: true });
		el.addEventListener("scrollend", settle, { passive: true });
		el.addEventListener("wheel", releaseGlide, { passive: true });
		el.addEventListener("touchstart", releaseGlide, { passive: true });
		return () => {
			el.removeEventListener("scroll", onScroll);
			el.removeEventListener("scrollend", settle);
			el.removeEventListener("wheel", releaseGlide);
			el.removeEventListener("touchstart", releaseGlide);
			releaseGlide();
		};
	});

	function scrollToTop() {
		const el = container;
		if (!el) return;
		atTop = true;
		gliding = true;
		clearTimeout(glideTimer);
		glideTimer = setTimeout(settle, GLIDE_TIMEOUT_MS);
		el.scrollTop = Math.min(el.scrollTop, el.clientHeight);
		el.scroll({ top: 0, behavior: "smooth" });
	}
</script>

{#if !atTop}
	<ScrollJumpButton
		label="Scroll to top"
		class={cn("absolute inset-x-0 z-10 mx-auto w-fit", className)}
		onclick={scrollToTop}
	>
		<CaretUpIcon />
	</ScrollJumpButton>
{/if}
