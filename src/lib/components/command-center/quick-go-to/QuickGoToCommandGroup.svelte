<script lang="ts">
	import * as Command from "#lib/components/ui/command/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import QuickGoToCommandItem from "./QuickGoToCommandItem.svelte";
</script>

<Command.Group heading={t("commands.quickGoTo.heading")} value="quick-go-to">
	<QuickGoToCommandItem link="/" value="grid" />
	<QuickGoToCommandItem link="/chat" value="chat" />
	<QuickGoToCommandItem link="/interest/taps" value="taps" />
	<QuickGoToCommandItem link="/interest/views" value="views" />
	<QuickGoToCommandItem link="/right-now" value="right-now" />
</Command.Group>
