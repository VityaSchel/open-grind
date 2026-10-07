<script>
	import { t } from "$lib/i18n";
	import ForgotPasswordForm from "./ForgotPasswordForm.svelte";
</script>

<svelte:head>
	<title>{t("auth.passwordReset.title")}</title>
</svelte:head>
<ForgotPasswordForm />
