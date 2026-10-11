<script lang="ts">
	import { untrack } from "svelte";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		deleteFavoriteNote,
		putFavoriteNote,
	} from "$lib/api/users/favorites";
	import MultilineField from "$lib/components/fields/MultilineField.svelte";
	import TextField from "$lib/components/fields/TextField.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as ResponsiveDialog from "$lib/components/ui/responsive-dialog";
	import { Spinner } from "$lib/components/ui/spinner";
	import { t } from "$lib/i18n";
	import {
		type FavoriteNote,
		favoriteNoteLimits,
	} from "$lib/model/users/favorites";
	import type { Profile } from "$lib/model/users/profiles";

	let {
		profileId,
		note,
		onSave,
		open = $bindable(),
	}: {
		profileId: Profile["profileId"];
		note: FavoriteNote;
		onSave: (note: FavoriteNote) => void;
		open: boolean;
	} = $props();

	let notes = $state(untrack(() => note.notes));
	let phoneNumber = $state(untrack(() => note.phoneNumber));
	let saving = $state(false);

	$effect(() => {
		if (!open) return;
		untrack(() => {
			notes = note.notes;
			phoneNumber = note.phoneNumber;
		});
	});

	const over = $derived(notes.length > favoriteNoteLimits.notes);
	const dirty = $derived(
		notes !== note.notes || phoneNumber !== note.phoneNumber,
	);

	async function save() {
		if (saving || !dirty || over) return;
		saving = true;
		const next = {
			notes: notes.trim(),
			phoneNumber: phoneNumber.trim(),
		} satisfies FavoriteNote;
		const emptied = !next.notes && !next.phoneNumber;
		try {
			if (emptied) await deleteFavoriteNote({ profileId });
			else await putFavoriteNote({ profileId, note: next });
			onSave(next);
			open = false;
			toast.success(
				emptied
					? t("profile.favoriteNote.deleted")
					: t("profile.favoriteNote.saved"),
			);
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: t("profile.favoriteNote.errors.saveFailed"),
				error,
			});
		} finally {
			saving = false;
		}
	}
</script>

<ResponsiveDialog.Root bind:open>
	<ResponsiveDialog.Content
		class="flex flex-col gap-4"
		drawerClass="**:[fieldset>div]:px-4"
		dialogProps={{ showCloseButton: true }}
	>
		<ResponsiveDialog.Header drawerClass="p-0">
			<ResponsiveDialog.Title>
				{t("profile.favoriteNote.title")}
			</ResponsiveDialog.Title>
			<ResponsiveDialog.Description class="sr-only">
				{t("profile.favoriteNote.a11y.description")}
			</ResponsiveDialog.Description>
		</ResponsiveDialog.Header>
		<fieldset disabled={saving} class="contents">
			<ResponsiveDialog.Body
				class="flex flex-col gap-4 pt-1"
				dialogClass="-mx-1 px-1"
			>
				<MultilineField
					bind:value={notes}
					maxLength={favoriteNoteLimits.notes}
					placeholder={t("profile.favoriteNote.placeholder")}
				/>
				<TextField
					label={t("profile.favoriteNote.phoneNumber.label")}
					bind:value={phoneNumber}
					maxLength={favoriteNoteLimits.phoneNumber}
					type="tel"
					placeholder={t(
						"profile.favoriteNote.phoneNumber.placeholder",
					)}
				/>
			</ResponsiveDialog.Body>
			<ResponsiveDialog.Footer drawerClass="pt-0">
				<Button
					disabled={!dirty || over}
					aria-busy={saving}
					onclick={() => save()}
				>
					{#if saving}
						<Spinner aria-hidden="true" />
					{/if}
					{t("common.actions.save")}
				</Button>
			</ResponsiveDialog.Footer>
		</fieldset>
	</ResponsiveDialog.Content>
</ResponsiveDialog.Root>
