<script lang="ts">
	import { showErrorToast } from "$lib/api/error-toast";
	import { sendTap } from "$lib/api/interest/taps";
	import TapIcon from "$lib/components/profile/TapIcon.svelte";
	import Button from "$lib/components/ui/button/button.svelte";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import { playHaptic } from "$lib/haptics";
	import { TapType, tapTypes } from "$lib/model/interest/taps";
	import { firedByTouch } from "$lib/platform/touch-origin";
	import {
		type LongPressHandlers,
		longPressHandlers,
		menuLongPressSource,
	} from "$lib/util/long-press";

	let {
		profileId,
		tapType,
		onTap,
	}: {
		profileId: number;
		tapType: TapType | null;
		onTap: (tapType: TapType | null) => void;
	} = $props();

	let customAnchor: HTMLButtonElement | null = $state(null);
	let open = $state(false);
	let sending = $state(false);
	let heldOpen = false;

	async function send(reaction: TapType) {
		if (sending || tapType !== null) return;
		sending = true;
		try {
			onTap(reaction);
			await sendTap({ recipientId: profileId, tapType: reaction });
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to send tap", error });
			onTap(null);
		} finally {
			sending = false;
		}
	}

	const defaultTapType = TapType.Hot;

	const sent = $derived(tapType !== null);

	function pickerPressHandlers(): LongPressHandlers {
		switch (menuLongPressSource()) {
			case "holdTimer": {
				const hold = longPressHandlers(() => {
					heldOpen = true;
					open = true;
				});
				return {
					...hold,
					onpointerdown(event) {
						heldOpen = false;
						hold.onpointerdown?.(event);
					},
				};
			}
			case "contextMenu":
				return {
					oncontextmenu(event) {
						event.preventDefault();
						if (!open && firedByTouch(event))
							playHaptic("longPress");
						open = true;
					},
				};
		}
	}

	const pickerPress = pickerPressHandlers();
</script>

<Button
	size="icon-lg"
	variant={sent ? "default" : "outline"}
	aria-label={tapType === null
		? `Send a ${tapTypes[defaultTapType]} tap`
		: `${tapTypes[tapType]} tap sent`}
	bind:ref={customAnchor}
	{...pickerPress}
	onclick={(event) => {
		const holdsClick = heldOpen && event.detail !== 0;
		heldOpen = false;
		if (holdsClick) return;
		void send(defaultTapType);
	}}
	disabled={sent || sending}
	class={{ "disabled:opacity-100": sent }}
>
	{#if tapType === null}
		<TapIcon tapType={defaultTapType} />
	{:else}
		<TapIcon {tapType} />
	{/if}
</Button>
{#snippet tapOption(tapType: TapType)}
	<DropdownMenu.Item
		class="w-10 px-2"
		aria-label="Send a {tapTypes[tapType]} tap"
		onclick={() => send(tapType)}
	>
		<TapIcon {tapType} />
	</DropdownMenu.Item>
{/snippet}
<DropdownMenu.Root bind:open>
	<DropdownMenu.Content
		class="w-13 min-w-0 rounded-2xl"
		align="center"
		{customAnchor}
	>
		{@render tapOption(TapType.Friendly)}
		{@render tapOption(TapType.Hot)}
		{@render tapOption(TapType.Looking)}
	</DropdownMenu.Content>
</DropdownMenu.Root>
