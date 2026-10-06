<script lang="ts">
	import { showErrorToast } from "$lib/api/error-toast";
	import { sendTap } from "$lib/api/interest/taps";
	import TapIcon from "$lib/components/profile/TapIcon.svelte";
	import Button from "$lib/components/ui/button/button.svelte";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import { playHaptic } from "$lib/haptics";
	import { type MessageKey, t } from "$lib/i18n";
	import { TapType } from "$lib/model/interest/taps";
	import { firedByTouch } from "$lib/platform/touch-origin";

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
			await sendTap({ recipientId: profileId, tapType: reaction });
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: t("profile.tap.errors.sendFailed"),
				error,
			});
			onTap(null);
		} finally {
			sending = false;
		}
	}

	const defaultTapType = TapType.Hot;

	const sendKeys = {
		[TapType.Friendly]: "profile.tap.a11y.send.friendly",
		[TapType.Hot]: "profile.tap.a11y.send.hot",
		[TapType.Looking]: "profile.tap.a11y.send.looking",
	} as const satisfies Record<TapType, MessageKey>;

	const sentKeys = {
		[TapType.Friendly]: "profile.tap.a11y.sent.friendly",
		[TapType.Hot]: "profile.tap.a11y.sent.hot",
		[TapType.Looking]: "profile.tap.a11y.sent.looking",
	} as const satisfies Record<TapType, MessageKey>;

	const sent = $derived(tapType !== null);
</script>

<Button
	size="icon-lg"
	variant={sent ? "default" : "outline"}
	aria-label={tapType === null
		? t(sendKeys[defaultTapType])
		: t(sentKeys[tapType])}
	bind:ref={customAnchor}
	oncontextmenu={(e) => {
		e.preventDefault();
		if (!open && firedByTouch(e)) playHaptic("longPress");
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
	<DropdownMenu.Item
		class="w-10 px-2"
		aria-label={t(sendKeys[tapType])}
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
