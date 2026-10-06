<script lang="ts">
	import SmileySadIcon from "phosphor-svelte/lib/SmileySadIcon";

	import * as Alert from "$lib/components/ui/alert";
	import { Button } from "$lib/components/ui/button";
	import Link from "$lib/components/ui/link/Link.svelte";
	import { t } from "$lib/i18n";
	import Rich from "$lib/i18n/Rich.svelte";
</script>

<Alert.Root class="m-auto w-full max-w-sm">
	<SmileySadIcon size="2em" color="#ffba20" weight="fill" />
	<Alert.Title>{t("common.unimplemented.title")}</Alert.Title>
	<Alert.Description>
		<Rich key="auth.signUp.unimplemented" params={{ issue: "21" }}>
			{#snippet link(text)}<Link
					href="https://git.opengrind.org/open-grind/open-grind/issues/21"
					>{text}</Link
				>{/snippet}
		</Rich>
		<Button
			variant="link"
			href="/auth/sign-in"
			class="mbs-1 block size-fit px-0"
		>
			Sign In
		</Button>
	</Alert.Description>
</Alert.Root>
