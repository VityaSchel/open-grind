<script lang="ts">
	import { Badge } from "$lib/components/ui/badge";
	import * as Item from "$lib/components/ui/item";
	import * as RadioGroup from "$lib/components/ui/radio-group";
	import { Spinner } from "$lib/components/ui/spinner";
	import { selectNotificationMode } from "$lib/push/delivery.svelte";
	import { notificationSettings } from "$lib/push/notification-state.svelte";
	import { cn } from "$lib/util/utils";
	import type { NotificationMode } from "$lib/push/types";
	import PushAddonAlert from "./PushAddonAlert.svelte";

	const modes: {
		mode: NotificationMode;
		title: string;
		description: string;
		recommended?: boolean;
	}[] = [
		{
			mode: "fast",
			title: "Fast mode",
			description:
				"Use Google's Firebase proprietary service to receive push notifications instantly",
			recommended: true,
		},
		{
			mode: "slow",
			title: "Slow mode",
			description:
				"Poll for new notifications periodically in the background using Android's native scheduler",
		},
	];

	let group = $state<HTMLElement | null>(null);

	function focusSelectedMode(event: Event): void {
		event.preventDefault();
		group
			?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')
			?.focus();
	}
</script>

<RadioGroup.Root
	bind:ref={group}
	aria-label="Delivery mode"
	disabled={notificationSettings.busy || !notificationSettings.enabled}
	class="overflow-hidden rounded-2xl border border-border transition-opacity data-disabled:opacity-60"
	bind:value={
		() => notificationSettings.mode,
		(next) => void selectNotificationMode(next as NotificationMode)
	}
>
	{#each modes as { mode, title, description, recommended } (mode)}
		<RadioGroup.Item
			value={mode}
			class={cn(
				Item.itemVariants(),
				"items-start rounded-none border-0 text-left not-first:border-t not-first:border-border focus-visible:ring-inset",
			)}
		>
			{#snippet children({ checked })}
				<Item.Content>
					<Item.Title>
						{title}
						{#if recommended}
							<Badge
								variant="secondary"
								class="font-normal text-primary"
							>
								Recommended
							</Badge>
						{/if}
					</Item.Title>
					<Item.Description class="line-clamp-none text-wrap">
						{description}
					</Item.Description>
				</Item.Content>
				<Item.Actions class="self-start pt-0.5">
					{#if mode === "fast" && notificationSettings.phase === "enablingFast"}
						<Spinner />
					{:else}
						<span
							class={[
								"flex size-5 items-center justify-center rounded-full border-2",
								{
									"border-primary": checked,
									"border-muted-foreground/70": !checked,
								},
							]}
						>
							{#if checked}
								<span class="size-2.5 rounded-full bg-primary"
								></span>
							{/if}
						</span>
					{/if}
				</Item.Actions>
			{/snippet}
		</RadioGroup.Item>
	{/each}
</RadioGroup.Root>
<PushAddonAlert onCloseAutoFocus={focusSelectedMode} />
