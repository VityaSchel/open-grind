<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Spinner } from "$lib/components/ui/spinner";
	import { turnOnGiphy } from "../../../giphy/giphy-consent";
	import GiphyConsentText from "../../../giphy/GiphyConsentText.svelte";

	let pending = $state(false);

	async function agree() {
		pending = true;
		await turnOnGiphy();
		pending = false;
	}
</script>

<div
	data-slot="giphy-consent-note"
	class="mx-auto flex max-w-sm flex-col items-center gap-4 py-8 text-center"
>
	<p
		class="text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground"
	>
		Enable GIPHY? <GiphyConsentText />
	</p>
	<Button disabled={pending} aria-busy={pending} onclick={() => void agree()}>
		{#if pending}
			<Spinner aria-hidden="true" />
		{/if}
		Continue
	</Button>
</div>
