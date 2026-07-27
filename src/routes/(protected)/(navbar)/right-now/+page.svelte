<script lang="ts">
	import SmileySadIcon from "phosphor-svelte/lib/SmileySadIcon";

	import * as Alert from "$lib/components/ui/alert";
	import Link from "$lib/components/ui/link/Link.svelte";
</script>

<div class="flex flex-1 px-8">
	<Alert.Root class="m-auto w-full max-w-sm">
		<SmileySadIcon size="2em" color="#ffba20" weight="fill" />
		<Alert.Title>Unimplemented</Alert.Title>
		<Alert.Description>
			"Right now" tab is not implemented yet, tracking in <Link
				href="https://git.opengrind.org/open-grind/open-grind/issues/43"
			>
				#43
			</Link>.
		</Alert.Description>
	</Alert.Root>
</div>
