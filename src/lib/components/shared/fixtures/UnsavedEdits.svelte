<script lang="ts">
	import { guardUnsavedChanges } from "../unsaved-changes-guard.svelte";

	let { dirty }: { dirty: boolean } = $props();

	guardUnsavedChanges(() => dirty);
</script>
