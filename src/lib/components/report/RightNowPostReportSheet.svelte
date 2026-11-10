<script lang="ts">
	import ReportSheet from "./ReportSheet.svelte";
	import type { RightNowPostReport } from "./right-now-post-report.svelte";

	let { report }: { report: RightNowPostReport } = $props();
</script>

{#if report.target !== null}
	{#key report.target}
		<ReportSheet bind:open={report.open} target={report.target} />
	{/key}
{/if}
