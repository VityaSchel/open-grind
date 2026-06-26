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
		class="fixed bottom-[calc(0.5rem+var(--safe-area-bottom)+var(--nav-height))] left-1/2 w-90.5 max-w-full -translate-x-1/2 px-2"
	>
		<nav
			class="flex flex-row items-center gap-2 rounded-full bg-muted p-2 shadow-xl backdrop-blur-lg"
		>
			<OpenConversationButton {profileId} {ourProfileId} />
			<TapProfileButton {profileId} {tapType} {onTap} />
		</nav>
	</div>
{/if}
