<script lang="ts">
	import Link from "$lib/components/ui/link/Link.svelte";

	let { name, blurb, url }: { name: string; blurb?: string; url?: string } =
		$props();

	const [before = "", after = ""] = $derived(blurb?.split("{name}") ?? []);
</script>

<p class="text-sm wrap-anywhere text-muted-foreground">
	{before}{#if url}<Link href={url} class="font-semibold hover:underline"
			>{name}</Link
		>{:else}<span class="font-semibold">{name}</span>{/if}{after}
</p>
