<script lang="ts">
	import { t } from "$lib/i18n";

	let {
		displayName,
		age,
	}: { displayName: string | null; age: number | null | undefined } =
		$props();
</script>

<h1 class="text-2xl wrap-break-word">
	{#if displayName !== null}
		<span class="font-semibold" translate="no">
			{displayName}
		</span>{:else}<span
			class="font-normal tracking-tight text-muted-foreground italic"
		>
			{t("common.someone")}
		</span>{/if}{#if age === undefined}, <span
			data-slot="skeleton"
			class="inline-block h-5 w-[2ch] animate-pulse rounded-2xl bg-muted align-middle"
		></span>{:else if age !== null}, {age}
	{/if}
</h1>
