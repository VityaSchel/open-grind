<script lang="ts">
	import ReportSheet from "./ReportSheet.svelte";
	import type { RightNowPostReportState } from "./right-now-post-report-state.svelte";

	let {
		report,
		onCloseAutoFocus,
	}: {
		report: RightNowPostReportState;
		onCloseAutoFocus?: (event: Event) => void;
	} = $props();
</script>

{#if report.target !== null}
	{#key report.target}
		<ReportSheet
			bind:open={report.open}
			target={report.target}
			{onCloseAutoFocus}
		/>
	{/key}
{/if}
