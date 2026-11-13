<script lang="ts">
	import ReportPostButton from "./ReportPostButton.svelte";

	let {
		id,
		text,
		placeholder,
		hasPhoto,
		onreport,
	}: {
		id: string;
		text: string | undefined;
		placeholder: string;
		hasPhoto: boolean;
		onreport: (() => Promise<void>) | null;
	} = $props();
</script>

<div class="flex items-start gap-2">
	<h2
		{id}
		class={[
			"min-w-0 flex-1 font-heading text-base font-medium wrap-break-word whitespace-pre-wrap",
			{ "text-muted-foreground": !text },
		]}
	>
		{text || placeholder}
	</h2>
	{#if onreport !== null && (Boolean(text) || hasPhoto)}
		<ReportPostButton {onreport} />
	{/if}
</div>
