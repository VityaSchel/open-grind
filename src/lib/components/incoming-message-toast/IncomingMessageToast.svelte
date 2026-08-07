<script lang="ts">
	import { goto } from "$app/navigation";
	import { toast } from "svelte-sonner";

	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
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
</script>

<div
	role="button"
	tabindex={0}
	class="flex h-14 w-full items-center gap-2 rounded-2xl border border-border bg-popover p-2 pe-3 text-start"
	onpointerdown={(e) => {
		const startPos = { x: e.clientX, y: e.clientY };
		let jumpedOff = false;
		const onPointerMove = (e: MouseEvent) => {
			const delta = {
				x: Math.abs(e.x - startPos.x),
				y: Math.abs(e.y - startPos.y),
			};
			if (delta.x + delta.y > 10) {
				jumpedOff = true;
				window.removeEventListener("pointermove", onPointerMove);
			}
		};
		const onPointerUp = () => {
			if (!jumpedOff) {
				void goto(`/chat/${conversationId}`);
				toast.dismiss(conversationId);
			}
			window.removeEventListener("pointerup", onPointerUp);
			window.removeEventListener("pointermove", onPointerMove);
		};
		window.addEventListener("pointermove", onPointerMove);
		window.addEventListener("pointerup", onPointerUp);
	}}
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
				Someone
			</span>
		{/if}
		<p class="truncate text-sm">
			{previewLabel(previewFromMessage(message))}
		</p>
	</div>
</div>
