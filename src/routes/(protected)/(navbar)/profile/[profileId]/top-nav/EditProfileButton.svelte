<script lang="ts">
	import PencilIcon from "phosphor-svelte/lib/PencilIcon";

	import { Button } from "#lib/components/ui/button/index.ts";
	import { t } from "#lib/i18n/index.ts";
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
