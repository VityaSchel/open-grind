<script lang="ts">
	import { ChatCircleSlashIcon, FunnelIcon } from "phosphor-svelte";

	import * as Empty from "$lib/components/ui/empty";
	import { t } from "$lib/i18n";
	import Rich from "$lib/i18n/Rich.svelte";

	let { filtered = false }: { filtered?: boolean } = $props();

	const Icon = $derived(filtered ? FunnelIcon : ChatCircleSlashIcon);
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<Icon weight="fill" />
		</Empty.Media>
		{#if filtered}
			<Empty.Title>{t("common.filters.noResults")}</Empty.Title>
			<Empty.Description>
				{t("chat.conversations.empty.filteredDescription")}
			</Empty.Description>
		{:else}
			<Empty.Title>{t("chat.conversations.empty.title")}</Empty.Title>
			<Empty.Description>
				<Rich key="chat.conversations.empty.description">
					{#snippet gridLink(text)}<a href="/">{text}</a>{/snippet}
				</Rich>
			</Empty.Description>
		{/if}
	</Empty.Header>
</Empty.Root>
