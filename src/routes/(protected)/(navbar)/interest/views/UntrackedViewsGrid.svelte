<script lang="ts">
	import ToggleLeftIcon from "phosphor-svelte/lib/ToggleLeftIcon";

	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import { t } from "$lib/i18n";

	let { enabling, onEnable }: { enabling: boolean; onEnable: () => void } =
		$props();
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<ToggleLeftIcon weight="fill" />
		</Empty.Media>
		<Empty.Title>{t("interest.views.untracked.title")}</Empty.Title>
		<Empty.Description>
			{t("interest.views.untracked.description")}
		</Empty.Description>
	</Empty.Header>
	<Empty.Content>
		<Button disabled={enabling} onclick={onEnable} class="min-w-30"
			>{t("interest.views.untracked.enable")}</Button
		>
	</Empty.Content>
</Empty.Root>
