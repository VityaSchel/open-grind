<script lang="ts">
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Spinner } from "$lib/components/ui/spinner";
	import { t } from "$lib/i18n";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import { turnOnGiphy } from "./giphy-consent";
	import GiphyConsentText from "./GiphyConsentText.svelte";

	let {
		open = $bindable(false),
		onCloseAutoFocus,
	}: { open?: boolean; onCloseAutoFocus?: (event: Event) => void } = $props();

	let busy = $state(false);

	const escapeKeydownBehavior = $derived(busy ? "ignore" : "close");

	dismissOnBackGesture({
		active: () => open,
		dismiss: () => {
			if (!busy) open = false;
		},
	});

	async function turnOn() {
		busy = true;
		const turnedOn = await turnOnGiphy();
		busy = false;
		if (turnedOn) open = false;
	}
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content
		{escapeKeydownBehavior}
		interactOutsideBehavior="ignore"
		{onCloseAutoFocus}
	>
		<AlertDialog.Header>
			<AlertDialog.Title
				>{t("chat.giphy.consent.title")}</AlertDialog.Title
			>
			<AlertDialog.Description>
				<GiphyConsentText />
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<fieldset disabled={busy} class="contents">
				<AlertDialog.Cancel size="lg">
					{t("common.actions.cancel")}
				</AlertDialog.Cancel>
				<AlertDialog.Action
					size="lg"
					aria-busy={busy}
					onclick={() => void turnOn()}
				>
					{#if busy}
						<Spinner aria-hidden="true" />
					{/if}
					{t("common.actions.continue")}
				</AlertDialog.Action>
			</fieldset>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
