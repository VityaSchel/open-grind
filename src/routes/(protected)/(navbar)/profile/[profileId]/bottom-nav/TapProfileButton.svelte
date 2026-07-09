<script lang="ts">
	import { showErrorToast } from "$lib/api/error";
	import { sendTap } from "$lib/api/interest/taps";
	import TapIcon from "$lib/components/profile/TapIcon.svelte";
	import Button from "$lib/components/ui/button/button.svelte";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import { TapType } from "$lib/model/interest/taps";

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

	async function send(reaction: TapType) {
		if (sending || tapType !== null) return;
		sending = true;
		try {
			onTap(reaction);
			await sendTap({
				recipientId: profileId,
				tapType: reaction,
			});
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: "Failed to send tap",
				error,
			});
			onTap(null);
		} finally {
			sending = false;
		}
	}

	const defaultTapType = TapType.Hot;

	const sent = $derived(tapType !== null);
</script>

<Button
	size="icon-lg"
	variant={sent ? "default" : "outline"}
	bind:ref={customAnchor}
	oncontextmenu={(e) => {
		e.preventDefault();
		open = true;
	}}
	onclick={() => send(defaultTapType)}
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
	<DropdownMenu.Item class="w-10 px-2" onclick={() => send(tapType)}>
		<TapIcon {tapType} />
	</DropdownMenu.Item>
{/snippet}
<DropdownMenu.Root bind:open>
	<DropdownMenu.Content class="min-w-0 w-13 rounded-2xl" align="center" {customAnchor}>
		{@render tapOption(TapType.Friendly)}
		{@render tapOption(TapType.Hot)}
		{@render tapOption(TapType.Looking)}
	</DropdownMenu.Content>
</DropdownMenu.Root>
