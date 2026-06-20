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

	const blurConfig = [
		{ blur: 1, gradient: [0, 10, 30, 40] },
		{ blur: 2, gradient: [10, 20, 40, 50] },
		{ blur: 4, gradient: [15, 30, 50, 60] },
		{ blur: 8, gradient: [20, 40, 60, 70] },
		{ blur: 12, gradient: [30, 50, 70, 80] },
		{ blur: 16, gradient: [40, 60, 80, 90] },
		{ blur: 24, gradient: [50, 70, 90, 100] },
		{ blur: 32, gradient: [60, 80] },
		{ blur: 64, gradient: [70, 100] },
	];
</script>

<svelte:element this={tag} class={className} {...rest}>
	<div class={["absolute top-0 left-0 size-full z-11", bgClass]}></div>
	{#each blurConfig as config, index}
		<div
			class={[
				"blur-filter absolute top-0 left-0 size-full",
				{
					"z-10": index === blurConfig.length - 1,
				},
			]}
			style:mask={`linear-gradient(
					${direction === "bottomToTop" ? "to bottom" : "to top"},
					rgba(0, 0, 0, 0) ${config.gradient[0]}%, 
					rgba(0, 0, 0, 1) ${config.gradient[1]}%${
						config.gradient.length === 4
							? `,
						rgba(0, 0, 0, 1) ${config.gradient[2]}%, 
						rgba(0, 0, 0, 0) ${config.gradient[3]}%
					`
							: ""
					} 
				);`}
			style="--pblur: {config.blur}px"
		></div>
	{/each}
	<div class={["relative z-12", contentClass]}>
		{@render children?.()}
	</div>
</svelte:element>

<style lang="postcss">
	.blur-filter {
		backdrop-filter: blur(var(--pblur));
	}
</style>
