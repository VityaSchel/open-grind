<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import Link from "$lib/components/ui/link/Link.svelte";
	import { Spinner } from "$lib/components/ui/spinner";

	let { pending, onAgree }: { pending: boolean; onAgree: () => void } =
		$props();
</script>

<div
	data-slot="giphy-consent-note"
	class="mx-auto flex max-w-sm flex-col items-center gap-4 py-8 text-center"
>
	<p
		class="text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground"
	>
		Enable GIPHY? You can search and send GIFs, and GIFs in your chats will
		load on their own. GIPHY will see your IP address, what you search for
		and that the requests come from a Grindr app.
		<Link
			href="https://support.giphy.com/hc/en-us/articles/360032872931-GIPHY-Privacy-Policy"
		>
			Privacy Policy
		</Link>
	</p>
	<Button disabled={pending} aria-busy={pending} onclick={onAgree}>
		{#if pending}
			<Spinner aria-hidden="true" />
		{/if}
		Continue
	</Button>
</div>
