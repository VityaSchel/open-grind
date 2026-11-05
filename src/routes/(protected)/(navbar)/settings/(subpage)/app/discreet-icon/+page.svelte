<script lang="ts">
	import CheckCircleIcon from "phosphor-svelte/lib/CheckCircleIcon";

	import { showErrorToast } from "#lib/api/error-toast.ts";
	import * as AlertDialog from "#lib/components/ui/alert-dialog/index.ts";
	import { Spinner } from "#lib/components/ui/spinner/index.ts";
	import { dismissOnBackGesture } from "#lib/platform/back-gesture-event.svelte.ts";
	import {
		currentDisguise,
		type DisguisePreset,
		disguisePresets,
		ORIGINAL_DISGUISE,
		selectDisguise,
	} from "#lib/platform/disguise.svelte.ts";
	import { currentPlatform } from "#lib/platform/os.ts";

	const previews = import.meta.glob<string>(
		"/src/lib/assets/disguise/*.webp",
		{ eager: true, import: "default", query: "?url" },
	);

	const original: DisguisePreset = {
		id: ORIGINAL_DISGUISE,
		name: "Open Grind",
	};
	const choices = $derived([original, ...disguisePresets()]);

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

	function preview(id: string) {
		return previews[`/src/lib/assets/disguise/${id}.webp`];
	}

	function stillShown(): string {
		switch (currentPlatform()) {
			case "android":
				return "Notifications and system settings still show Open Grind.";
			case "macos":
				return "The menu bar, notifications and system settings still show Open Grind. Renaming the app needs an administrator account.";
			case "windows":
				return "Task Manager still shows Open Grind.";
			case "linux":
				return "Task managers still show Open Grind.";
			default:
				return "";
		}
	}

	function restartNotice(choice: DisguisePreset): string | null {
		switch (currentPlatform()) {
			case "android":
				return `Open Grind restarts as ${choice.name}. Its home screen shortcut is removed, so add it again from the app drawer.`;
			case "macos":
				return `Open Grind restarts to rename itself to ${choice.name}.`;
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
			await selectDisguise(choice.id);
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

<p class="px-4 text-sm text-muted-foreground">
	Change how Open Grind looks on your home screen and in your app list.
	{stillShown()}
</p>
<div
	class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5"
	data-slot="disguise-choices"
>
	{#each choices as choice (choice.id)}
		{@const selected = choice.id === currentDisguise()}
		<button
			type="button"
			aria-pressed={selected}
			disabled={applying}
			onclick={() => choose(choice)}
			class="relative flex min-w-0 flex-col items-center gap-1.5 rounded-xl p-2 transition-colors disabled:opacity-60 can-hover:hover:bg-accent"
		>
			<img
				src={preview(choice.id)}
				alt=""
				width="64"
				height="64"
				class={[
					"size-16 rounded-2xl",
					{
						"ring-1 ring-border": !selected,
						"ring-2 ring-primary ring-offset-2 ring-offset-background":
							selected,
					},
				]}
			/>
			{#if selected}
				<CheckCircleIcon
					weight="fill"
					aria-hidden="true"
					class="absolute top-1 right-1 size-5 rounded-full bg-background text-primary"
				/>
			{/if}
			<span class="w-full truncate text-center text-xs"
				>{choice.name}</span
			>
		</button>
	{/each}
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
