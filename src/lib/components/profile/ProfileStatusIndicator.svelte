<script lang="ts">
	import AirplaneTiltIcon from "phosphor-svelte/lib/AirplaneTiltIcon";

	import { t } from "$lib/i18n";
	import { getNow } from "$lib/util/now";

	let {
		onlineUntil,
		isVisiting,
		class: className,
	}: {
		onlineUntil: number | null | undefined;
		isVisiting?: boolean;
		class?: import("svelte/elements").ClassValue;
	} = $props();

	const online = $derived((onlineUntil ?? 0) > getNow());
	const title = $derived.by(() => {
		if (online && isVisiting) {
			return t("profile.onlineStatus.onlineNowVisiting");
		}
		if (online) {
			return t("profile.onlineStatus.onlineNow");
		}
		if (isVisiting) {
			return t("profile.onlineStatus.visiting");
		}
	});
</script>

{#if isVisiting || online}
	<div
		class={[
			"flex shrink-0",
			{ "text-green-500": online, "text-gray-400": !online },
			className,
		]}
		{title}
	>
		{#if isVisiting}
			<AirplaneTiltIcon weight="fill" class="size-3" />
		{:else}
			<span class="size-2 rounded-full bg-green-500"></span>
		{/if}
		<span class="sr-only">{title}</span>
	</div>
{/if}
