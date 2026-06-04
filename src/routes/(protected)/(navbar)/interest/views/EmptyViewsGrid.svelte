<script lang="ts">
	import EyeSlashIcon from "phosphor-svelte/lib/EyeSlashIcon";

	import * as Empty from "$lib/components/ui/empty";
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<EyeSlashIcon weight="fill" />
		</Empty.Media>
		<Empty.Title>No Views Yet</Empty.Title>
		<Empty.Description>
			When someone views your profile, they'll show up here.
		</Empty.Description>
	</Empty.Header>
</Empty.Root>
