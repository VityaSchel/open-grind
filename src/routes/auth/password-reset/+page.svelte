<script>
	import PageTitle from "#lib/components/shared/PageTitle.svelte";
	import { t } from "#lib/i18n/index.ts";
	import ForgotPasswordForm from "./ForgotPasswordForm.svelte";
</script>

<PageTitle page={t("auth.passwordReset.title")} />
<ForgotPasswordForm />
