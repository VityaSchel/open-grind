<script lang="ts">
	import Button from "$lib/components/ui/button/button.svelte";
	import { t } from "$lib/i18n";

	let {
		profileId,
		ourProfileId,
	}: { profileId: number; ourProfileId: number } = $props();

	const conversationId = $derived(
		[profileId, ourProfileId].toSorted((a, b) => a - b).join(":"),
	);
</script>

<Button
	variant="outline"
	size="lg"
	class="flex-1 justify-start bg-input/20!"
	href="/chat/{conversationId}"
>
	<span class="font-normal text-muted-foreground"
		>{t("profile.bottomNav.writeMessage")}</span
	>
</Button>
