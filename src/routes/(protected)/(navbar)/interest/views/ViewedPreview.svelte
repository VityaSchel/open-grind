<script lang="ts">
	import HeartIcon from "phosphor-svelte/lib/HeartIcon";
	import LockSimpleIcon from "phosphor-svelte/lib/LockSimpleIcon";

	import ProfileMiniCard from "$lib/components/ProfileMiniCard.svelte";
	import type { ViewPreview } from "$lib/model/interest/views";

	let {
		preview,
	}: {
		preview: ViewPreview;
	} = $props();
</script>

<ProfileMiniCard
	mediaHash={preview.profileImageMediaHash}
	distance={preview.distance}
>
	{#snippet overlay()}
		<div class="absolute inset-0 flex items-center justify-center">
			<div
				class="flex size-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm"
			>
				{#if preview.isSecretAdmirer}
					<HeartIcon weight="fill" class="size-4.5 text-rose-400" />
				{:else}
					<LockSimpleIcon weight="fill" class="size-4.5" />
				{/if}
			</div>
		</div>
	{/snippet}
</ProfileMiniCard>
