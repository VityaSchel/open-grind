<script lang="ts">
	import EyeSlashIcon from "phosphor-svelte/lib/EyeSlashIcon";

	import { unhideUser } from "#lib/api/browse/hides.ts";
	import { Button } from "#lib/components/ui/button/index.ts";
	import * as Empty from "#lib/components/ui/empty/index.ts";
	import { t } from "#lib/i18n/index.ts";
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
		<Empty.Title>{t("profile.hidden.title")}</Empty.Title>
		<Empty.Description>
			<Button
				variant="secondary"
				disabled={changingViewability}
				onclick={() =>
					applyViewabilityChange({
						change: markViewable,
						request: () => unhideUser({ profileId }),
						failureLabel: t(
							"common.viewability.errors.unhideFailed",
						),
					})}>{t("profile.hidden.unhide")}</Button
			>
		</Empty.Description>
	</Empty.Header>
</Empty.Root>
