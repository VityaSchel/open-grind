<script lang="ts">
	import { untrack } from "svelte";
	import { SvelteSet } from "svelte/reactivity";

	import { appLifecycle } from "$lib/api/app-lifecycle.svelte";
	import { showErrorToast } from "$lib/api/error-toast";
	import SwitchField from "$lib/components/ui/switch-field/SwitchField.svelte";
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
	<SwitchField
		title={TITLES[category]}
		disabled={!notificationSettings.enabled || saving.has(category)}
		bind:checked={
			() => enabled && !systemBlocked,
			(next: boolean) => void change({ category, enabled: next })
		}
	/>
{/each}
