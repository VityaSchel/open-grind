<script lang="ts">
	import { refreshAnnouncer } from "./refresh-announcer.svelte";
</script>

<div role="status" class="sr-only">{refreshAnnouncer.text}</div>
