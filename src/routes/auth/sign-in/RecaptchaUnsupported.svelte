<script lang="ts">
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import Link from "$lib/components/ui/link/Link.svelte";

	let { open = $bindable() }: { open: boolean } = $props();
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Captcha verification required</AlertDialog.Title>
			<AlertDialog.Description>
				Grindr requires captcha verification for your device or account,
				which Open Grind does not currently support. <Link
					href="https://git.opengrind.org/open-grind/open-grind/issues/129"
				>
					Follow for updates on issue #129
				</Link>.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Action>OK</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
