<script lang="ts">
	let {
		src,
		blur,
		class: className,
		photoClass,
	}: {
		src: string | null;
		blur: "pill" | "chip" | "veil";
		class?: import("svelte/elements").ClassValue;
		photoClass?: import("svelte/elements").ClassValue;
	} = $props();
</script>

{#if src !== null}
	<span
		aria-hidden="true"
		class={[
			"frost pointer-events-none absolute -z-1 overflow-hidden rounded-[inherit]",
			className,
		]}
	>
		<span
			class={[
				"absolute inset-0 overflow-hidden",
				{
					"filter-(--pill-frost)": blur === "pill",
					"filter-(--chip-frost)": blur === "chip",
					"filter-(--veil-frost)": blur === "veil",
				},
			]}
		>
			<img
				{src}
				alt=""
				draggable="false"
				class={[
					"absolute size-[100cqw] max-w-none object-cover",
					photoClass,
				]}
			/>
		</span>
	</span>
{/if}
