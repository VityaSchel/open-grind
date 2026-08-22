<script lang="ts">
	import ToggleLeftIcon from "phosphor-svelte/lib/ToggleLeftIcon";

	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";

	let { enabling, onEnable }: { enabling: boolean; onEnable: () => void } =
		$props();
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<ToggleLeftIcon weight="fill" />
		</Empty.Media>
		<Empty.Title>Profile viewers aren't tracked</Empty.Title>
		<Empty.Description>
			Your profile viewers are not being recorded, because you have
			toggled Viewed Me List off in the official app. Press the button
			below to enable this feature and update this setting in the official
			client.
		</Empty.Description>
	</Empty.Header>
	<Empty.Content>
		<Button disabled={enabling} onclick={onEnable} class="min-w-30"
			>Enable</Button
		>
	</Empty.Content>
</Empty.Root>
