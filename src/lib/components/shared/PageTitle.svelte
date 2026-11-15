<script lang="ts">
	import { t } from "#lib/i18n/index.ts";

	let { page }: { page: string } = $props();
</script>

<svelte:head>
	<title>{t("shell.documentTitle", { page })}</title>
</svelte:head>
