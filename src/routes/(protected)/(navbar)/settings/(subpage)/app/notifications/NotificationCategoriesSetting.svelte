<script lang="ts">
	import { untrack } from "svelte";
	import { SvelteSet } from "svelte/reactivity";

	import { appLifecycle } from "$lib/api/app-lifecycle.svelte";
	import { showErrorToast } from "$lib/api/error-toast";
	import SwitchField from "$lib/components/ui/switch-field/SwitchField.svelte";
	import { isAndroidPlatform } from "$lib/platform/os";
	import {
		loadNotificationCategories,
		notificationCategories,
		toggleNotificationCategory,
	} from "$lib/push/categories.svelte";
	import { pushFailures } from "$lib/push/error-copy";
	import { notificationSettings } from "$lib/push/notification-state.svelte";
	import type { PushCategoryName } from "$lib/push/types";

	const TITLES: Record<PushCategoryName, string> = {
		messages: "New messages",
		taps: "Received taps",
	};

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
			showErrorToast({ label: pushFailures.saveCategory, error });
		} finally {
			saving.delete(category);
		}
	}
</script>

{#each notificationCategories.list as { category, enabled, systemBlocked } (category)}
	{@const unavailable = inSlowMode && category === "taps"}
	<div class="flex flex-col gap-1.5">
		<SwitchField
			title={TITLES[category]}
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
				Not available in slow mode
			</p>
		{/if}
	</div>
{/each}
