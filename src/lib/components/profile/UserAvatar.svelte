<script lang="ts">
	import { PUBLIC_ENABLE_BLUR_EFFECTS } from "$app/env/public";

	import { matureContentCovered } from "#lib/components/mature-content/mature-content.ts";
	import MatureContentCover from "#lib/components/mature-content/MatureContentCover.svelte";
	import UserSilhouette from "#lib/components/profile/UserSilhouette.svelte";
	import MediaImage from "#lib/components/shared/MediaImage.svelte";
	import { profileMediaUrl } from "#lib/util/media.ts";

	let {
		mediaHash,
		own = false,
		class: className = "size-80",
		size = "md",
		onload,
	}: {
		mediaHash: string | null;
		own?: boolean;
		class?: import("svelte/elements").ClassValue;
		size?: "md" | "lg" | "xl";
		onload?: (image: HTMLImageElement) => void;
	} = $props();

	const covered = $derived(!own && matureContentCovered());
</script>

<div class={["relative", className]}>
	{#if mediaHash}
		<MediaImage
			src={profileMediaUrl({ mediaHash, size: "thumb" })}
			class="h-full w-full"
			imgClass={[
				"bg-neutral-600",
				{ "blur-2xl": PUBLIC_ENABLE_BLUR_EFFECTS },
			]}
			tone="photo"
			{size}
			loading="lazy"
			{onload}
		/>
		{#if covered}
			<MatureContentCover compact />
		{/if}
	{:else}
		<div class="flex size-full items-center justify-center bg-neutral-700">
			<UserSilhouette
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
