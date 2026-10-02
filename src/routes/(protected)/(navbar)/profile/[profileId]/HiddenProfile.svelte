<script lang="ts">
	import { EyeSlashIcon } from "phosphor-svelte";

	import { unhideUser } from "$lib/api/browse/hides";
	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import {
		applyViewabilityChange,
		type PendingViewabilityChange,
	} from "./profile-state.svelte";

	let {
		profileId,
		changingViewability,
		markViewable,
	}: {
		profileId: number;
		changingViewability: boolean;
		markViewable: () => PendingViewabilityChange;
	} = $props();
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<EyeSlashIcon />
		</Empty.Media>
		<Empty.Title>You hid this profile.</Empty.Title>
		<Empty.Description>
			<Button
				variant="secondary"
				disabled={changingViewability}
				onclick={() =>
					applyViewabilityChange({
						change: markViewable,
						request: () => unhideUser({ profileId }),
						failureLabel: "Failed to unhide user",
					})}>Unhide</Button
			>
		</Empty.Description>
	</Empty.Header>
</Empty.Root>
