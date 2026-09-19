<script lang="ts">
	import { appLifecycle } from "$lib/api/app-lifecycle.svelte";
	import { showErrorToast } from "$lib/api/error-toast";
	import SwitchField from "$lib/components/ui/switch-field/SwitchField.svelte";
	import {
		loadNotificationCategories,
		notificationCategories,
		showCategoryInSystemSettings,
		toggleNotificationCategory,
	} from "$lib/push/notifications.svelte";
	import type { PushCategoryName } from "$lib/push/types";

	const LABELS: Record<
		PushCategoryName,
		{ title: string; description: string }
	> = {
		messages: {
			title: "Messages",
			description: "Someone sends you a chat message",
		},
		taps: { title: "Taps", description: "Someone taps you" },
	};

	$effect(() => {
		if (appLifecycle.active) void loadNotificationCategories();
	});

	function change(category: PushCategoryName, enabled: boolean) {
		toggleNotificationCategory(category, enabled).catch(
			(error: unknown) => {
				void loadNotificationCategories();
				showErrorToast({
					label: "Failed to save notifications",
					error,
				});
			},
		);
	}
</script>

{#each notificationCategories.list as { category, enabled, systemBlocked } (category)}
	<SwitchField
		title={LABELS[category].title}
		description={systemBlocked
			? "Android is blocking this category. Turn it back on in system settings."
			: LABELS[category].description}
		disabled={systemBlocked}
		bind:checked={
			() => enabled && !systemBlocked,
			(next: boolean) => change(category, next)
		}
	/>
	{#if systemBlocked}
		<button
			type="button"
			onclick={() => void showCategoryInSystemSettings(category)}
		>
			Open Android settings
		</button>
	{/if}
{/each}

<style lang="postcss">
	@reference "$layout";

	button {
		@apply px-4 text-start text-sm text-primary underline;
	}
</style>
