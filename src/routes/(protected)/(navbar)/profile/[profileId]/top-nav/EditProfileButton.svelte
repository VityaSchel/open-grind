<script lang="ts">
	import { PencilIcon } from "phosphor-svelte";

	import { Button } from "$lib/components/ui/button";
	import { t } from "$lib/i18n";
</script>

<Button
	size="lg"
	href="/settings/profile"
	variant="default"
	aria-label={t("profile.topNav.editProfile")}
	class="h-12 text-base"
>
	<PencilIcon class="size-6" />
	{t("profile.topNav.editProfile")}
</Button>
