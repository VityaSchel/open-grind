<script>
	import ComposerStickersMenu from "./ComposerStickersMenu.svelte";
	import ComposerStickersTrigger from "./ComposerStickersTrigger.svelte";

	let menuOpen = $state(false);
</script>

<ComposerStickersTrigger onClick={() => (menuOpen = true)} />
<ComposerStickersMenu bind:open={menuOpen} />
