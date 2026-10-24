<script lang="ts">
	import { listen } from "@tauri-apps/api/event";
	import { isSameYear } from "date-fns";
	import ArrowUpRightIcon from "phosphor-svelte/lib/ArrowUpRightIcon";
	import { onMount } from "svelte";

	import {
		accountStatusState,
		dismissAccountStatus,
		noticeAccountStatusError,
		showAccountRestriction,
		showAccountStatus,
	} from "$lib/api/account-status-state.svelte";
	import { copyToClipboard } from "$lib/api/error-copy";
	import {
		asAccountStatusError,
		banInfoSchema,
		callMethod,
		restrictionSchema,
	} from "$lib/api/methods";
	import { signOut } from "$lib/api/sign-out";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Button, buttonVariants } from "$lib/components/ui/button";
	import Link from "$lib/components/ui/link/Link.svelte";
	import { Spinner } from "$lib/components/ui/spinner";
	import { t } from "$lib/i18n";
	import { formatClockTime, formatDate } from "$lib/i18n/format";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import { updatesSelfManaged } from "$lib/updates/capability.svelte";
	import { checkForUpdatesNow } from "$lib/updates/update-checks";
	import { now } from "$lib/util/clock";
	import { BAN_APPEAL_URL, grindrHelpUrl } from "$lib/util/grindr-help";
	import {
		banOffersAppeal,
		banSubReasonLabel,
		timedBanOffersAppeal,
	} from "./ban-sub-reasons";

	type ExternalAction = { label: string; href: string };

	type Content = {
		title: string;
		description: string;
		learnMoreHref?: string;
		externalAction?: ExternalAction;
		details?: unknown;
		closeLabel?: string;
		checksForUpdates?: boolean;
	};

	const DOWNLOAD_PAGE_URL = "https://opengrind.org/guides/download";

	const status = $derived(accountStatusState.status);

	const signsOut = $derived(
		status?.kind === "banned" || status?.kind === "restriction",
	);

	function appeal(): ExternalAction {
		return {
			label: t("feedback.accountStatus.appeal"),
			href: BAN_APPEAL_URL,
		};
	}

	function bannedDescription(subReason: string | null | undefined) {
		const reason = banSubReasonLabel(subReason);
		return reason
			? t("feedback.accountStatus.banned.descriptionWithReason", {
					reason,
				})
			: t("feedback.accountStatus.banned.description");
	}

	function suspensionEnd(endsAt: number) {
		return {
			date: formatDate({
				date: endsAt,
				preset: isSameYear(endsAt, now()) ? "monthDay" : "monthDayYear",
			}),
			time: formatClockTime(endsAt),
		};
	}

	function suspendedDescription({
		subReason,
		endsAt,
	}: {
		subReason?: string | null;
		endsAt?: number | null;
	}) {
		const reason = banSubReasonLabel(subReason);
		if (!endsAt) {
			return reason
				? t("feedback.accountStatus.suspended.descriptionWithReason", {
						reason,
					})
				: t("feedback.accountStatus.suspended.description");
		}
		const end = suspensionEnd(endsAt);
		return reason
			? t("feedback.accountStatus.suspended.descriptionWithReasonUntil", {
					reason,
					...end,
				})
			: t("feedback.accountStatus.suspended.descriptionUntil", end);
	}

	const content = $derived.by((): Content => {
		if (status?.kind === "banned") {
			const { info } = status;
			if (info.kind === "network") {
				return {
					title: t("feedback.accountStatus.networkBlocked.title"),
					description: t(
						"feedback.accountStatus.networkBlocked.description",
					),
					closeLabel: t("feedback.accountStatus.ok"),
				};
			}
			if (info.kind === "device") {
				return {
					title: t("feedback.accountStatus.securityCheck.title"),
					description: t(
						"feedback.accountStatus.securityCheck.description",
					),
					details: info,
				};
			}
			if (info.kind === "underage" && info.code === 35) {
				return {
					title: t("feedback.accountStatus.ageRestricted.title"),
					description: t(
						"feedback.accountStatus.ageRestricted.description",
					),
					externalAction: {
						label: t(
							"feedback.accountStatus.ageRestricted.verifyAge",
						),
						href: grindrHelpUrl("ageVerification"),
					},
				};
			}
			return {
				title: t("feedback.accountStatus.banned.title"),
				description: bannedDescription(info.subReason),
				learnMoreHref: grindrHelpUrl("bannedProfiles"),
				externalAction: banOffersAppeal(info.subReason)
					? appeal()
					: undefined,
				details: info,
			};
		}
		if (status?.kind === "restriction") {
			const { restriction } = status;
			if (restriction.kind === "ageVerification") {
				return {
					title: t("feedback.accountStatus.ageVerification.title"),
					description: t(
						"feedback.accountStatus.ageVerification.description",
					),
				};
			}
			if (restriction.kind === "timedBan") {
				return {
					title: t("feedback.accountStatus.suspended.title"),
					description: suspendedDescription(restriction),
					externalAction: timedBanOffersAppeal(restriction.subReason)
						? appeal()
						: undefined,
				};
			}
			return {
				title: t("feedback.accountStatus.restricted.title"),
				description: t("feedback.accountStatus.restricted.description"),
			};
		}
		if (status?.kind === "unsupportedVersion") {
			return {
				title: t("feedback.accountStatus.unsupportedVersion.title"),
				description: t(
					"feedback.accountStatus.unsupportedVersion.description",
				),
				details: status.error,
				checksForUpdates: true,
			};
		}
		if (status?.kind === "phoneVerificationRequired") {
			return {
				title: t("feedback.accountStatus.phoneVerification.title"),
				description: t(
					"feedback.accountStatus.phoneVerification.description",
				),
				details: status.error,
				closeLabel: t("feedback.accountStatus.ok"),
			};
		}
		return { title: "", description: "" };
	});

	const closeLabel = $derived(
		content.closeLabel ??
			(signsOut ? t("common.actions.signOut") : undefined),
	);

	onMount(() => {
		const unlisteners = [
			listen("auth:banned", (event) => {
				const parsed = banInfoSchema.safeParse(event.payload);
				if (!parsed.success) return;
				showAccountStatus({ kind: "banned", info: parsed.data });
			}),
			listen("auth:restriction", (event) => {
				const parsed = restrictionSchema.safeParse(event.payload);
				if (!parsed.success) return;
				showAccountRestriction(parsed.data);
			}),
			listen("auth:unsupported-version", (event) => {
				const error = asAccountStatusError(event.payload);
				if (error) noticeAccountStatusError(error);
			}),
		];

		void callMethod("account_restriction")
			.then(showAccountRestriction)
			.catch(() => {});

		return () => {
			for (const unlisten of unlisteners) {
				void unlisten.then((fn) => fn());
			}
		};
	});

	let running: false | "signOut" | "checkForUpdates" = $state(false);

	const dismissible = $derived(!signsOut && running === false);

	const dismissBehavior = $derived(dismissible ? "close" : "ignore");

	dismissOnBackGesture({
		active: () => accountStatusState.open,
		dismiss: () => {
			if (dismissible) dismissAccountStatus();
		},
	});

	function copyDetails() {
		void copyToClipboard({
			text: JSON.stringify(content.details, null, 2),
		});
	}

	async function checkForUpdates() {
		running = "checkForUpdates";
		try {
			await checkForUpdatesNow({
				selfManaged: true,
				addonAvailable: false,
			});
		} finally {
			running = false;
		}
	}

	async function close() {
		if (!signsOut) {
			dismissAccountStatus();
			return;
		}
		running = "signOut";
		try {
			await signOut();
		} finally {
			running = false;
			accountStatusState.open = false;
		}
	}
</script>

<AlertDialog.Root
	bind:open={
		() => accountStatusState.open,
		(next) => {
			if (!next && dismissible) dismissAccountStatus();
		}
	}
>
	<AlertDialog.Content
		escapeKeydownBehavior={dismissBehavior}
		interactOutsideBehavior={dismissBehavior}
	>
		<AlertDialog.Header>
			<AlertDialog.Title>{content.title}</AlertDialog.Title>
			<AlertDialog.Description>
				{content.description}
				{#if content.learnMoreHref}
					<Link href={content.learnMoreHref} class="underline">
						{t("common.actions.learnMore")}
					</Link>
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<fieldset disabled={running !== false} class="contents">
				{#if content.details !== undefined}
					<Button variant="ghost" onclick={copyDetails}>
						{t("feedback.accountStatus.copyDetails")}
					</Button>
				{/if}
				{#if content.externalAction}
					<Link
						href={content.externalAction.href}
						class={buttonVariants({ variant: "outline" })}
					>
						{content.externalAction.label}
						<ArrowUpRightIcon />
					</Link>
				{/if}
				{#if content.checksForUpdates}
					{#if updatesSelfManaged()}
						<Button
							onclick={checkForUpdates}
							aria-busy={running === "checkForUpdates"}
						>
							{#if running === "checkForUpdates"}
								<Spinner aria-hidden="true" />
							{/if}
							{t(
								"feedback.accountStatus.unsupportedVersion.checkForUpdates",
							)}
						</Button>
					{:else}
						<Link href={DOWNLOAD_PAGE_URL} class={buttonVariants()}>
							{t(
								"feedback.accountStatus.unsupportedVersion.checkForUpdates",
							)}
							<ArrowUpRightIcon />
						</Link>
					{/if}
				{/if}
				{#if closeLabel}
					<Button onclick={close} aria-busy={running === "signOut"}>
						{#if running === "signOut"}
							<Spinner aria-hidden="true" />
						{/if}
						{closeLabel}
					</Button>
				{/if}
			</fieldset>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
