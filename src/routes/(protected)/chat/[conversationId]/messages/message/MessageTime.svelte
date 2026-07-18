<script lang="ts">
	import { format } from "date-fns";

	import { getMessageContext } from "./context";

	const { timestamp } = $derived(getMessageContext()());
</script>

{format(new Date(timestamp), "H:mm")}
