<script>
	import ComposerAttachmentsMenu from "./ComposerAttachmentsMenu.svelte";
	import ComposerAttachmentsTrigger from "./ComposerAttachmentsTrigger.svelte";

	let menuOpen = $state(false);
</script>

<ComposerAttachmentsTrigger onClick={() => (menuOpen = true)} />
<ComposerAttachmentsMenu bind:open={menuOpen} />
