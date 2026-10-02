<script lang="ts">
	import { loadWhenVisible } from "$lib/util/load-when-visible";
	import { firstFrameSrc, releaseVideoOnDestroy } from "$lib/util/media";

	let {
		src,
		class: className,
	}: { src: string; class?: import("svelte/elements").ClassValue } = $props();

	let armed = $state(false);
</script>

<video
	data-slot="video-preview"
	src={armed ? firstFrameSrc(src) : undefined}
	use:loadWhenVisible={() => (armed = true)}
	{@attach releaseVideoOnDestroy}
	preload="metadata"
	muted
	playsinline
	tabindex="-1"
	aria-hidden="true"
	class={["pointer-events-none object-cover", className]}
></video>
