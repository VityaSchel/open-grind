<script lang="ts">
	import OpenConversationButton from "./OpenConversationButton.svelte";

	let {
		ourProfileId,
		profileId,
		profile,
	}: {
		ourProfileId: number;
		profileId: number;
		profile: import("$lib/model/profile").Profile;
	} = $props();

	const isOurProfile = $derived(profileId === ourProfileId);
</script>

<nav class="absolute -translate-y-1/2 right-2 flex items-center gap-1.5">
	{#if !isOurProfile}
		<OpenConversationButton {profileId} {ourProfileId} />
	{/if}
</nav>
