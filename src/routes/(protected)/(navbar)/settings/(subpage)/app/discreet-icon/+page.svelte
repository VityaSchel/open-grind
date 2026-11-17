<script lang="ts">
	import { page } from "$app/state";

	import { showErrorToast } from "#lib/api/error-toast.ts";
	import * as AlertDialog from "#lib/components/ui/alert-dialog/index.ts";
	import { Spinner } from "#lib/components/ui/spinner/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import { dismissOnBackGesture } from "#lib/platform/back-gesture-event.svelte.ts";
	import {
		currentDisguise,
		disguiseFailure,
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
				return t("settings.app.discreetAppIcon.stillShown.android");
			case "macos":
				return t("settings.app.discreetAppIcon.stillShown.macos");
			case "windows":
				return t("settings.app.discreetAppIcon.stillShown.windows");
			case "linux":
				return t("settings.app.discreetAppIcon.stillShown.linux");
			case "ios":
				return "";
		}
	}

	function restartNotice(choice: DisguisePreset): string | null {
		switch (currentPlatform()) {
			case "android":
				return t("settings.app.discreetAppIcon.restart.android", {
					appName: choice.name,
				});
			case "macos":
				return disguiseRenameNeedsAdmin()
					? null
					: t("settings.app.discreetAppIcon.restart.macos", {
							appName: choice.name,
						});
			case "ios":
			case "linux":
			case "windows":
				return null;
		}
	}

	function failureLabel({
		error,
		choice,
	}: {
		error: unknown;
		choice: DisguisePreset;
	}): string {
		switch (disguiseFailure(error)) {
			case "nameTaken":
				return t("settings.app.discreetAppIcon.errors.nameTaken", {
					appName: choice.name,
				});
			case "renameNeedsAdmin":
				return t(
					"settings.app.discreetAppIcon.errors.renameNeedsAdmin",
				);
			case "failed":
				return t("settings.app.discreetAppIcon.errors.changeFailed");
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
			showErrorToast({ label: failureLabel({ error, choice }), error });
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
		<span
			class={[
				"-m-1 rounded-[calc(var(--radius-md)_+_--spacing(1))] border-2 p-0.5",
				{ "border-transparent": !selected, "border-primary": selected },
			]}
		>
			<img
				src={data.previews[choice.id]}
				alt=""
				width="64"
				height="64"
				class={[
					"block size-16 rounded-md",
					{ "ring-1 ring-border": !selected },
				]}
			/>
		</span>
		<span
			translate="no"
			class={[
				"line-clamp-2 w-full text-center text-xs text-balance",
				{ "text-primary": selected },
			]}>{choice.name}</span
		>
	</button>
{/snippet}

<p class="px-4 text-sm text-muted-foreground">
	{t("settings.app.discreetAppIcon.description")}
	{stillShown()}
	{#if disguiseRenameNeedsAdmin()}
		{t("settings.app.discreetAppIcon.renameNeedsAdmin")}
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
			<AlertDialog.Title>
				{t("settings.app.discreetAppIcon.confirm.title")}
			</AlertDialog.Title>
			<AlertDialog.Description>
				{pending ? restartNotice(pending) : ""}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<fieldset disabled={applying} class="contents">
				<AlertDialog.Cancel size="lg">
					{t("common.actions.cancel")}
				</AlertDialog.Cancel>
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
					{t("settings.app.discreetAppIcon.confirm.change")}
				</AlertDialog.Action>
			</fieldset>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
