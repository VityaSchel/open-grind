<script lang="ts">
	import { loadWhenVisible } from "$lib/util/load-when-visible";

	let {
		src,
		class: className,
	}: { src: string; class?: import("svelte/elements").ClassValue } = $props();

	let armed = $state(false);
</script>

<video
	data-slot="video-preview"
	src={armed ? `${src}#t=0.001` : undefined}
	use:loadWhenVisible={() => (armed = true)}
	preload="metadata"
	muted
	playsinline
	tabindex="-1"
	aria-hidden="true"
	class={["pointer-events-none object-cover", className]}
></video>
