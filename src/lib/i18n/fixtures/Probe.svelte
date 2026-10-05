<script lang="ts">
	import { t } from "$lib/i18n";
	import Rich from "$lib/i18n/Rich.svelte";

	let { count }: { count: number } = $props();

	const minutes = $derived(t("common.time.minutes", { count }));
</script>

<button data-slot="close">{t("common.actions.close")}</button>
<p data-slot="minutes">{minutes}</p>
<p data-slot="known-issue">
	<Rich key="feedback.requestBlocked.cloudflare.knownIssue">
		{#snippet link(text)}<a href="/issues/81">{text}</a>{/snippet}
	</Rich>
</p>
