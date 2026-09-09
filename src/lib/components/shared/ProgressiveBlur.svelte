<script lang="ts">
	// Credit: https://kennethnym.com/blog/progressive-blur-in-css/ by @kennethnym

	let {
		class: className,
		bgClass,
		contentClass,
		children,
		direction,
		tag = "div",
		...rest
	}: {
		class?: import("svelte/elements").ClassValue;
		bgClass?: import("svelte/elements").ClassValue;
		contentClass?: import("svelte/elements").ClassValue;
		children?: import("svelte").Snippet;
		direction: "topToBottom" | "bottomToTop";
		tag?: keyof HTMLElementTagNameMap;
		[key: string]: unknown;
	} = $props();

	const layers = [0, 1, 2, 3, 4, 5, 6, 7, 8];
</script>

<svelte:element
	this={tag}
	class={["pblur", className]}
	data-pblur-direction={direction}
	{...rest}
>
	<div
		class={["pblur-bg absolute top-0 left-0 z-11 size-full", bgClass]}
	></div>
	{#each layers as layer (layer)}
		<div class="pblur-layer" data-pblur-layer={layer}></div>
	{/each}
	<div class="pblur-scrim"></div>
	<div class={["relative z-12", contentClass]}>
		{@render children?.()}
	</div>
</svelte:element>
