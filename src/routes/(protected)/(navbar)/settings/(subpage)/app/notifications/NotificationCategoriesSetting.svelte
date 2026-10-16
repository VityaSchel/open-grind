<script lang="ts">
	import { untrack } from "svelte";
	import { SvelteSet } from "svelte/reactivity";

	import { appLifecycle } from "$lib/api/app-lifecycle.svelte";
	import { showErrorToast } from "$lib/api/error-toast";
	import SwitchField from "$lib/components/ui/switch-field/SwitchField.svelte";
	import { type PlainMessageKey, t } from "$lib/i18n";
	import { isAndroidPlatform } from "$lib/platform/os";
	import {
		loadNotificationCategories,
		notificationCategories,
		toggleNotificationCategory,
	} from "$lib/push/categories.svelte";
	import { notificationSettings } from "$lib/push/notification-state.svelte";
	import type { PushCategoryName } from "$lib/push/types";

	const titleKeys = {
		messages: "settings.notifications.categories.messages",
		taps: "settings.notifications.categories.taps",
	} as const satisfies Record<PushCategoryName, PlainMessageKey>;

	const saving = new SvelteSet<PushCategoryName>();

	const inSlowMode = $derived(
		isAndroidPlatform() && notificationSettings.mode === "slow",
	);

	$effect(() => {
		if (appLifecycle.active)
			untrack(() => void loadNotificationCategories());
	});

	async function change({
		category,
		enabled,
	}: {
		category: PushCategoryName;
		enabled: boolean;
	}): Promise<void> {
		saving.add(category);
		try {
			await toggleNotificationCategory({ category, enabled });
		} catch (error) {
			void loadNotificationCategories();
			showErrorToast({
				label: t("settings.notifications.categories.errors.saveFailed"),
				error,
			});
		} finally {
			saving.delete(category);
		}
	}
</script>

{#each notificationCategories.list as { category, enabled, systemBlocked } (category)}
	{@const unavailable = inSlowMode && category === "taps"}
	<div class="flex flex-col gap-1.5">
		<SwitchField
			title={t(titleKeys[category])}
			disabled={!notificationSettings.enabled ||
				unavailable ||
				saving.has(category)}
			bind:checked={
				() => enabled && !systemBlocked && !unavailable,
				(next: boolean) => void change({ category, enabled: next })
			}
		/>
		{#if unavailable}
			<p class="px-4 text-sm text-muted-foreground">
				{t("settings.notifications.categories.unavailableInSlowMode")}
			</p>
		{/if}
	</div>
{/each}
