<script lang="ts">
	import { goto } from "$app/navigation";
	import { onDestroy } from "svelte";
	import { toast } from "svelte-sonner";

	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import { t } from "$lib/i18n";
	import {
		previewFromMessage,
		previewLabel,
	} from "$lib/model/messaging/message-preview";
	import { type ApiResponseMessage } from "$lib/model/messaging/messages";

	let {
		conversationId,
		message,
		sender,
	}: {
		conversationId: string;
		message: ApiResponseMessage;
		sender?: { name: string; avatarMediaHash: string | null };
	} = $props();

	const TAP_SLOP_PX = 10;

	let press: AbortController | null = null;

	onDestroy(() => press?.abort());

	function pressed(down: PointerEvent) {
		press?.abort();
		const held = new AbortController();
		press = held;
		const { signal } = held;
		let movedOff = false;
		window.addEventListener(
			"pointermove",
			(move) => {
				const travelled =
					Math.abs(move.clientX - down.clientX) +
					Math.abs(move.clientY - down.clientY);
				if (travelled > TAP_SLOP_PX) movedOff = true;
			},
			{ signal },
		);
		window.addEventListener(
			"pointerup",
			() => {
				held.abort();
				if (movedOff) return;
				void goto(`/chat/${conversationId}`);
				toast.dismiss(conversationId);
			},
			{ signal },
		);
		window.addEventListener("pointercancel", () => held.abort(), {
			signal,
		});
	}
</script>

<div
	role="button"
	tabindex={0}
	class="flex h-14 w-full items-center gap-2 rounded-2xl border border-border bg-popover p-2 pe-3 text-start"
	onpointerdown={pressed}
>
	<UserAvatar
		mediaHash={sender?.avatarMediaHash ?? null}
		class="size-10 shrink-0 rounded-xl bg-neutral-700 *:rounded-xl"
	/>
	<div class="flex min-w-0 flex-col">
		{#if sender && sender.name}
			<span
				class="truncate font-heading text-sm leading-snug font-medium"
			>
				{sender.name}
			</span>
		{:else}
			<span
				class="font-normal tracking-tight text-muted-foreground italic"
			>
				{t("common.someone")}
			</span>
		{/if}
		<p class="truncate text-sm">
			{previewLabel(previewFromMessage(message))}
		</p>
	</div>
</div>
