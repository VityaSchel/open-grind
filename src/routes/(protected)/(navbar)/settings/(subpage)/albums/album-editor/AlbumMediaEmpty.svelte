<script lang="ts">
	import ImagesIcon from "phosphor-svelte/lib/ImagesIcon";
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";

	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import { t } from "$lib/i18n";

	let {
		title,
		description,
		disabled,
		onAdd,
	}: {
		title: string;
		description: string;
		disabled: boolean;
		onAdd: () => void;
	} = $props();
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<ImagesIcon weight="fill" />
		</Empty.Media>
		<Empty.Title>{title}</Empty.Title>
		<Empty.Description>{description}</Empty.Description>
	</Empty.Header>
	<Empty.Content>
		<Button {disabled} onclick={onAdd}>
			<PlusIcon weight="bold" />
			{t("media.albums.editor.content.addMedia")}
		</Button>
	</Empty.Content>
</Empty.Root>
