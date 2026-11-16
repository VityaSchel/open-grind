<script lang="ts">
	import { formatRelativeTime } from "#lib/i18n/format.ts";
	import { t } from "#lib/i18n/index.ts";
	import { getNow } from "#lib/util/now.ts";

	let {
		onlineUntil,
		seen,
		self = false,
	}: {
		onlineUntil: number | null;
		seen: number | null;
		self?: boolean;
	} = $props();

	const online = $derived(onlineUntil !== null && onlineUntil > getNow());
</script>

{#if self || online}
	<div class="flex items-center gap-1.5 whitespace-nowrap">
		<span
			class="ms-0.5 inline-block size-2 shrink-0 rounded-full bg-green-500"
		>
		</span>
		{t("profile.onlineStatus.onlineNow")}
	</div>
{:else if seen !== null}
	<span class="text-gray-500">
		{t("profile.onlineStatus.lastOnline", {
			ago: formatRelativeTime({ date: seen, baseDate: getNow() }),
		})}
	</span>
{:else}
	<span class="text-gray-500">{t("profile.onlineStatus.offline")}</span>
{/if}
