<script lang="ts">
	import { goto } from "$app/navigation";
	import { toast } from "svelte-sonner";

	import UserAvatar from "$lib/components/profile/UserAvatar.svelte";
	import {
		type ApiResponseMessage,
		previewFromMessage,
		previewLabel,
	} from "$lib/model/messaging/messages";

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
	class="bg-popover border border-border rounded-2xl p-2 pe-3 flex items-center gap-2 h-14 w-full text-start"
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
		class="rounded-xl bg-neutral-700 *:rounded-xl size-10 shrink-0"
	/>
	<div class="flex flex-col min-w-0">
		{#if sender && sender.name}
			<span class="font-medium truncate font-heading leading-snug text-sm">
				{sender.name}
			</span>
		{:else}
			<span class="font-normal tracking-tight italic text-muted-foreground">
				Someone
			</span>
		{/if}
		<p class="text-sm truncate">
			{previewLabel(previewFromMessage(message))}
		</p>
	</div>
</div>
