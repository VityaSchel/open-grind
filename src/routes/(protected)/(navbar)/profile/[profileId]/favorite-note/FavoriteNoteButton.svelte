<script lang="ts">
	import NotePencilIcon from "phosphor-svelte/lib/NotePencilIcon";

	import { Button } from "#lib/components/ui/button/index.ts";
	import type { FavoriteNote } from "#lib/model/users/favorites.ts";
	import type { Profile } from "#lib/model/users/profiles.ts";
	import { holdsStillOnPull } from "../hold-still-on-pull";
	import FavoriteNoteEditor from "./FavoriteNoteEditor.svelte";

	let {
		profileId,
		note,
		onSave,
	}: {
		profileId: Profile["profileId"];
		note: FavoriteNote;
		onSave: (note: FavoriteNote) => void;
	} = $props();

	let open = $state(false);

	const empty = $derived(!note.notes && !note.phoneNumber);
	const label = $derived(note.notes || note.phoneNumber || "Add note");
</script>

<Button
	size="sm"
	variant={empty ? "secondary" : "default"}
	class="absolute top-2 right-2 z-10 max-w-1/2"
	data-refresh-no-pull=""
	onclick={() => (open = true)}
	{@attach holdsStillOnPull}
>
	<NotePencilIcon
		weight={empty ? "regular" : "fill"}
		class="size-4 shrink-0"
	/>
	<span class="truncate">{label}</span>
</Button>
<FavoriteNoteEditor {profileId} {note} {onSave} bind:open />
