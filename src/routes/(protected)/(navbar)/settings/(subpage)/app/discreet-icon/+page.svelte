<script lang="ts">
	import { page } from "$app/state";

	import { showErrorToast } from "#lib/api/error-toast.ts";
	import * as AlertDialog from "#lib/components/ui/alert-dialog/index.ts";
	import { Spinner } from "#lib/components/ui/spinner/index.ts";
	import { dismissOnBackGesture } from "#lib/platform/back-gesture-event.svelte.ts";
	import {
		currentDisguise,
		type DisguisePreset,
		disguisePresets,
		disguiseRenameNeedsAdmin,
		ORIGINAL_DISGUISE,
		selectDisguise,
	} from "#lib/platform/disguise.svelte.ts";
	import { currentPlatform } from "#lib/platform/os.ts";

	let { data }: import("./$types").PageProps = $props();

	const original: DisguisePreset = {
		id: ORIGINAL_DISGUISE,
		name: "Open Grind",
	};

	let pending = $state<DisguisePreset | null>(null);
	let applying = $state(false);
	let alertOpen = $state(false);

	const escapeKeydownBehavior = $derived(applying ? "ignore" : "close");

	dismissOnBackGesture({
		active: () => alertOpen,
		dismiss: () => {
			if (!applying) alertOpen = false;
		},
	});

	function stillShown(): string {
		switch (currentPlatform()) {
			case "android":
				return "The app's name still shows in notifications and system settings.";
			case "macos":
				return "The app's name still shows in the menu bar, notifications and system settings. If the Dock keeps the old icon or name, Command-click it there.";
			case "windows":
				return "The app's name still shows in Task Manager.";
			case "linux":
				return "The app's name still shows in task managers.";
			default:
				return "";
		}
	}

	function restartNotice(choice: DisguisePreset): string | null {
		switch (currentPlatform()) {
			case "android":
				return `Open Grind restarts as ${choice.name}. Its home screen shortcut is removed, so add it again from the app drawer.`;
			case "macos":
				return disguiseRenameNeedsAdmin()
					? null
					: `Open Grind restarts to rename itself to ${choice.name}.`;
			case "linux":
			case "windows":
				return null;
			default:
				return null;
		}
	}

	async function apply(choice: DisguisePreset) {
		applying = true;
		try {
			await selectDisguise(choice.id, {
				resume:
					restartNotice(choice) === null ? null : page.url.pathname,
			});
		} catch (error) {
			showErrorToast({
				label:
					typeof error === "string"
						? error
						: "Couldn't change the app icon",
				error,
			});
		} finally {
			applying = false;
			alertOpen = false;
		}
	}

	function choose(choice: DisguisePreset) {
		if (applying || choice.id === currentDisguise()) return;
		if (restartNotice(choice) === null) {
			void apply(choice);
			return;
		}
		pending = choice;
		alertOpen = true;
	}
</script>

{#snippet choiceButton(choice: DisguisePreset)}
	{@const selected = choice.id === currentDisguise()}
	<button
		type="button"
		aria-pressed={selected}
		disabled={applying}
		onclick={() => choose(choice)}
		class="flex w-26 flex-col items-center gap-1.5 rounded-lg p-2 transition-colors disabled:opacity-60 can-hover:hover:bg-muted"
	>
		<img
			src={data.previews[choice.id]}
			alt=""
			width="64"
			height="64"
			class={[
				"size-16 rounded-md",
				{
					"ring-1 ring-border": !selected,
					"ring-2 ring-primary ring-offset-2 ring-offset-background":
						selected,
				},
			]}
		/>
		<span
			class={[
				"line-clamp-2 w-full text-center text-xs text-balance",
				{ "text-primary": selected },
			]}>{choice.name}</span
		>
	</button>
{/snippet}

<p class="px-4 text-sm text-muted-foreground">
	Change how Open Grind looks on your home screen and in your app list.
	{stillShown()}
	{#if disguiseRenameNeedsAdmin()}
		Renaming the app needs an administrator account.
	{/if}
</p>
<div
	class="@container/disguise-choices mt-4 flex flex-col items-center gap-2"
	data-slot="disguise-choices"
>
	{@render choiceButton(original)}
	<div
		class="grid w-fit grid-cols-3 gap-x-1 gap-y-2 @2xl/disguise-choices:grid-cols-6"
	>
		{#each disguisePresets() as choice (choice.id)}
			{@render choiceButton(choice)}
		{/each}
	</div>
</div>
<AlertDialog.Root bind:open={alertOpen}>
	<AlertDialog.Content {escapeKeydownBehavior}>
		<AlertDialog.Header>
			<AlertDialog.Title>Change the app icon?</AlertDialog.Title>
			<AlertDialog.Description>
				{pending ? restartNotice(pending) : ""}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<fieldset disabled={applying} class="contents">
				<AlertDialog.Cancel size="lg">Cancel</AlertDialog.Cancel>
				<AlertDialog.Action
					onclick={() => {
						if (pending) void apply(pending);
					}}
					size="lg"
					aria-busy={applying}
				>
					{#if applying}
						<Spinner aria-hidden="true" />
					{/if}
					Change
				</AlertDialog.Action>
			</fieldset>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
