<script lang="ts">
	import FireIcon from "phosphor-svelte/lib/FireIcon";

	import * as Empty from "$lib/components/ui/empty";
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<FireIcon weight="fill" />
		</Empty.Media>
		<Empty.Title>No Taps Yet</Empty.Title>
		<Empty.Description>
			Browse <a href="/">Grid</a> to find people, and they might tap you back.
		</Empty.Description>
	</Empty.Header>
</Empty.Root>
