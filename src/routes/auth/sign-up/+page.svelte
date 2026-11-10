<script>
	import PageTitle from "#lib/components/shared/PageTitle.svelte";
	import { t } from "#lib/i18n/index.ts";
	import RegisterForm from "./RegisterForm.svelte";
</script>

<PageTitle page={t("auth.signUp.title")} />
<RegisterForm />
