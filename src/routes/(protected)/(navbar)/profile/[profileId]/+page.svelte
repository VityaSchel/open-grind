<script lang="ts">
	import BackButton from "./BackButton.svelte";
	import ProfilePager from "./pager/ProfilePager.svelte";

	let { data }: import("./$types").PageProps = $props();
</script>

<BackButton />
<ProfilePager ourProfileId={data.ourProfileId} />
