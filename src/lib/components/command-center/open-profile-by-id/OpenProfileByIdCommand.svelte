<script lang="ts">
	import z from "zod";

	import * as Command from "$lib/components/ui/command";
	import { commandCenterState } from "../command-center-state.svelte";
	import OpenProfileByIdCommandItem from "./OpenProfileByIdCommandItem.svelte";

	const queryNumeric = $derived(commandCenterState.query.substring(1));
	const queryHasValue = $derived(queryNumeric.length > 0);
	const profileId = $derived.by(() => {
		if (!queryHasValue) return null;
		return (
			z.coerce.number().int().nonnegative().safeParse(queryNumeric).data ?? null
		);
	});
</script>

{#if !queryHasValue || profileId !== null}
	<Command.Group heading="Open profile by id...">
		<OpenProfileByIdCommandItem {profileId} />
	</Command.Group>
{/if}
