<script lang="ts">
	import SmileySadIcon from "phosphor-svelte/lib/SmileySadIcon";

	import * as Alert from "$lib/components/ui/alert";
	import { Button } from "$lib/components/ui/button";
	import Link from "$lib/components/ui/link/Link.svelte";
</script>

<Alert.Root class="m-auto w-full max-w-sm">
	<SmileySadIcon size="2em" color="#ffba20" weight="fill" />
	<Alert.Title>Unimplemented</Alert.Title>
	<Alert.Description>
		Registration is not implemented yet, track <Link
			href="https://git.opengrind.org/open-grind/open-grind/issues/21"
		>
			#21
		</Link>.
		<Button
			variant="link"
			href="/auth/sign-in"
			class="mbs-1 block size-fit px-0"
		>
			Sign In
		</Button>
	</Alert.Description>
</Alert.Root>
