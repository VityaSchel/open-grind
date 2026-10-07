<script lang="ts">
	import EyeSlashIcon from "phosphor-svelte/lib/EyeSlashIcon";

	import * as Empty from "$lib/components/ui/empty";
	import { t } from "$lib/i18n";
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<EyeSlashIcon weight="fill" />
		</Empty.Media>
		<Empty.Title>{t("interest.views.empty.title")}</Empty.Title>
		<Empty.Description>
			{t("interest.views.empty.description")}
		</Empty.Description>
	</Empty.Header>
</Empty.Root>
