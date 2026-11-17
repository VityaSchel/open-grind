<script lang="ts">
	import DotsThreeIcon from "phosphor-svelte/lib/DotsThreeIcon";

	import { showErrorToast } from "#lib/api/error-toast.ts";
	import { sendTap } from "#lib/api/interest/taps.ts";
	import TapIcon from "#lib/components/profile/TapIcon.svelte";
	import Button from "#lib/components/ui/button/button.svelte";
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.ts";
	import { playHaptic } from "#lib/haptics.ts";
	import { type MessageKey, t } from "#lib/i18n/index.ts";
	import { TapType } from "#lib/model/interest/taps.ts";
	import { firedByTouch } from "#lib/platform/touch-origin.ts";

	let {
		profileId,
		tapType,
		onTap,
	}: {
		profileId: number;
		tapType: TapType | null;
		onTap: (tapType: TapType | null) => void;
	} = $props();

	const hintId = $props.id();

	let customAnchor: HTMLButtonElement | null = $state(null);
	let open = $state(false);
	let sending = $state(false);
	let keyboardOpener: HTMLElement | null = null;

	function openPicker(opener: HTMLElement | null) {
		keyboardOpener = opener;
		open = true;
	}

	function returnFocusToOpener(event: Event) {
		const opener = keyboardOpener;
		if (open || opener === null) return;
		keyboardOpener = null;
		event.preventDefault();
		(unavailable || !opener.isConnected ? customAnchor : opener)?.focus();
	}

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
	const unavailable = $derived(sent || sending);
</script>

<div class="relative flex shrink-0">
	<Button
		size="icon-lg"
		variant={sent ? "default" : "outline"}
		aria-label={tapType === null
			? t(sendKeys[defaultTapType])
			: t(sentKeys[tapType])}
		aria-describedby={sent ? undefined : hintId}
		aria-disabled={unavailable}
		bind:ref={customAnchor}
		oncontextmenu={(e) => {
			e.preventDefault();
			if (unavailable) return;
			if (!open && firedByTouch(e)) playHaptic("longPress");
			const focused = e.currentTarget.matches(":focus-visible");
			openPicker(focused ? e.currentTarget : null);
		}}
		onclick={() => send(defaultTapType)}
		class={[
			"aria-disabled:pointer-events-none",
			{
				"aria-disabled:opacity-100": sent,
				"aria-disabled:opacity-50": !sent,
			},
		]}
	>
		{#if tapType === null}
			<TapIcon tapType={defaultTapType} />
		{:else}
			<TapIcon {tapType} />
		{/if}
	</Button>
	{#if !sent}
		<span id={hintId} hidden>{t("profile.tap.a11y.otherTapsHint")}</span>
		<Button
			data-slot="tap-options"
			variant="secondary"
			size="icon-sm"
			aria-label={t("profile.tap.a11y.chooseTap")}
			aria-haspopup="menu"
			aria-expanded={open}
			class="absolute bottom-full left-1/2 mb-2 size-8 -translate-x-1/2 transition-none not-focus-visible:sr-only"
			onclick={(event) => openPicker(event.currentTarget)}
			oncontextmenu={(event) => {
				event.preventDefault();
				openPicker(event.currentTarget);
			}}
		>
			<DotsThreeIcon weight="bold" />
		</Button>
	{/if}
</div>
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
		onCloseAutoFocus={returnFocusToOpener}
	>
		{@render tapOption(TapType.Friendly)}
		{@render tapOption(TapType.Hot)}
		{@render tapOption(TapType.Looking)}
	</DropdownMenu.Content>
</DropdownMenu.Root>
