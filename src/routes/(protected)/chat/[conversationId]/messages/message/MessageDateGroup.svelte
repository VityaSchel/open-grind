<script lang="ts">
	import { isToday, startOfToday } from "date-fns";

	import { t } from "$lib/i18n";
	import { formatDate } from "$lib/i18n/format";

	let { dayStart }: { dayStart: number } = $props();
</script>

<span class="mb-4 text-center text-xs text-muted-foreground">
	{#if isToday(dayStart)}
		{t("common.time.today")}
	{:else if startOfToday().getTime() - dayStart < 7 * 24 * 60 * 60 * 1000}
		{formatDate({ date: dayStart, preset: "weekday" })}
	{:else}
		{formatDate({ date: dayStart, preset: "weekdayMonthDay" })}
	{/if}
</span>
