<script lang="ts">
	import AirplaneTiltIcon from "phosphor-svelte/lib/AirplaneTiltIcon";

	import { formatRelativeTime } from "#lib/i18n/format.ts";
	import { t } from "#lib/i18n/index.ts";
	import { getNow } from "#lib/util/now.ts";

	let {
		onlineUntil,
		seen,
		self = false,
		isVisiting = false,
	}: {
		onlineUntil: number | null;
		seen: number | null;
		self?: boolean;
		isVisiting?: boolean;
	} = $props();

	const online = $derived(
		self || (onlineUntil !== null && onlineUntil > getNow()),
	);
	const status = $derived.by(() => {
		if (online) {
			return t("profile.onlineStatus.onlineNow");
		}
		if (seen !== null) {
			return t("profile.onlineStatus.lastOnline", {
				ago: formatRelativeTime({ date: seen, baseDate: getNow() }),
			});
		}
		return t("profile.onlineStatus.offline");
	});
</script>

<div
	class={[
		"flex items-center gap-1.5",
		{ "whitespace-nowrap": online, "text-gray-500": !online },
	]}
>
	{#if isVisiting}
		<span
			class={["flex shrink-0", { "text-green-500": online }]}
			title={t("profile.onlineStatus.visiting")}
		>
			<AirplaneTiltIcon weight="fill" class="size-3" />
			<span class="sr-only">{t("profile.onlineStatus.visiting")}</span>
		</span>
	{:else if online}
		<span
			data-slot="online-status-dot"
			class="ms-0.5 inline-block size-2 shrink-0 rounded-full bg-green-500"
		>
		</span>
	{/if}
	{status}
</div>
