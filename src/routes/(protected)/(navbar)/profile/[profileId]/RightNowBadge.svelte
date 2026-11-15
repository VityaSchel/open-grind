<script lang="ts">
	import HouseIcon from "phosphor-svelte/lib/HouseIcon";

	import SplashIcon from "#lib/components/right-now/SplashIcon.svelte";
	import { t } from "#lib/i18n/index.ts";
	import type { RightNowStatus } from "#lib/model/right-now/index.ts";

	let { status }: { status: RightNowStatus } = $props();
</script>

{#if status !== "NOT_ACTIVE"}
	<span
		data-slot="profile-right-now-badge"
		class="flex items-center gap-1 whitespace-nowrap text-purple-400"
	>
		{#if status === "HOSTING"}
			<HouseIcon weight="fill" class="shrink-0" />
			{t("profile.rightNow.badge.hosting")}
		{:else}
			<SplashIcon weight="fill" class="shrink-0" />
			{t("profile.rightNow.badge.rightNow")}
		{/if}
	</span>
{/if}
