<script lang="ts">
	import FireIcon from "phosphor-svelte/lib/FireIcon";

	import * as Empty from "$lib/components/ui/empty";
	import { t } from "$lib/i18n";
	import Rich from "$lib/i18n/Rich.svelte";
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<FireIcon weight="fill" />
		</Empty.Media>
		<Empty.Title>{t("interest.taps.empty.title")}</Empty.Title>
		<Empty.Description>
			<Rich key="interest.taps.empty.description">
				{#snippet link(text)}<a href="/">{text}</a>{/snippet}
			</Rich>
		</Empty.Description>
	</Empty.Header>
</Empty.Root>
