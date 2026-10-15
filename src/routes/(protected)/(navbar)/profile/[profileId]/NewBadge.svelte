<script lang="ts">
	import SparkleIcon from "phosphor-svelte/lib/SparkleIcon";

	import { t } from "$lib/i18n";

	let { isNew }: { isNew: boolean } = $props();
</script>

{#if isNew}
	<span
		data-slot="new-badge"
		class="flex items-center gap-1 whitespace-nowrap text-primary"
		title={t("profile.newBadge.title")}
	>
		<SparkleIcon weight="fill" class="shrink-0" />
		{t("profile.newBadge.label")}
	</span>
{/if}
