<script lang="ts">
	import { env } from "$env/dynamic/public";
	import { UserIcon } from "phosphor-svelte";

	import { profileMediaUrl } from "$lib/util/media";

	let {
		mediaHash,
		class: className = "size-80",
		size = "md",
	}: {
		mediaHash: string | null;
		class?: import("svelte/elements").ClassValue;
		size?: "md" | "lg" | "xl";
	} = $props();
</script>

<div class={[className]}>
	{#if mediaHash}
		<img
			src={profileMediaUrl(mediaHash, "thumb")}
			alt=""
			class={[
				"h-full w-full bg-neutral-600 object-cover object-center",
				{
					"blur-2xl": env.PUBLIC_ENABLE_BLUR_EFFECTS,
				},
			]}
			loading="lazy"
			draggable="false"
		/>
	{:else}
		<div class="flex size-full items-center justify-center bg-neutral-700">
			<UserIcon
				weight="fill"
				color="var(--color-stone-400)"
				class={[
					"m-auto",
					{
						"size-1/2": size === "md",
						"size-3/5": size === "lg",
						"size-3/4": size === "xl",
					},
				]}
			/>
		</div>
	{/if}
</div>
