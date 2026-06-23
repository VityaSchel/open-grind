<script lang="ts">
	import type { TapType } from "$lib/model/interest/taps";
	import OpenConversationButton from "./OpenConversationButton.svelte";
	import TapProfileButton from "./TapProfileButton.svelte";

	let {
		ourProfileId,
		profileId,
		tapType,
		onTap,
	}: {
		ourProfileId: number;
		profileId: number;
		tapType: TapType | null;
		onTap: (tapType: TapType | null) => void;
	} = $props();

	const isOurProfile = $derived(profileId === ourProfileId);
</script>

{#if !isOurProfile}
	<div
		class="fixed bottom-[calc(0.5rem+var(--safe-area-bottom)+4rem)] left-1/2 -translate-x-1/2 max-w-full w-90.5 px-2"
	>
		<nav
			class="flex flex-row items-center gap-2 bg-muted p-2 rounded-full backdrop-blur-lg shadow-xl"
		>
			<OpenConversationButton {profileId} {ourProfileId} />
			<TapProfileButton {profileId} {tapType} {onTap} />
		</nav>
	</div>
{/if}
