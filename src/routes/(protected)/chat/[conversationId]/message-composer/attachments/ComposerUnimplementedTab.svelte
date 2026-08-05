<script lang="ts">
	import SmileySadIcon from "phosphor-svelte/lib/SmileySadIcon";

	import * as Alert from "$lib/components/ui/alert";
	import Link from "$lib/components/ui/link/Link.svelte";

	let { label, issue }: { label: string; issue: number } = $props();
</script>

<div class="flex flex-1 py-16">
	<Alert.Root class="m-auto w-full max-w-sm">
		<SmileySadIcon size="2em" color="#ffba20" weight="fill" />
		<Alert.Title>Unimplemented</Alert.Title>
		<Alert.Description>
			{label} is not implemented yet, tracking in <Link
				href="https://git.opengrind.org/open-grind/open-grind/issues/{issue}"
			>
				#{issue}
			</Link>.
		</Alert.Description>
	</Alert.Root>
</div>
