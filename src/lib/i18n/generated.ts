export interface Messages {
	"common.actions.close": undefined;
	"common.actions.retry": undefined;
	"common.time.hours": { count: number };
	"common.time.justNow": undefined;
	"common.time.minutes": { count: number };
	"common.time.yesterday": undefined;
	"feedback.errorCopy.copied": undefined;
	"feedback.errorCopy.errors.copyFailed": undefined;
	"feedback.errorToast.copyDetails": undefined;
	"feedback.errorToast.defaultLabel": undefined;
	"feedback.requestBlocked.cloudflare.advice": undefined;
	"feedback.requestBlocked.cloudflare.description": undefined;
	"feedback.requestBlocked.cloudflare.title": undefined;
	"feedback.requestBlocked.dontShowAgain": undefined;
	"feedback.requestBlocked.network.advice": undefined;
	"feedback.requestBlocked.network.description": undefined;
	"feedback.requestBlocked.network.title": undefined;
	"feedback.requestBlocked.rotate": undefined;
	"feedback.requestBlocked.rotated": undefined;
	"feedback.requestBlocked.vpnHint": undefined;
	"shell.error.copied": undefined;
	"shell.error.copyError": undefined;
	"shell.error.description": undefined;
	"shell.error.goHome": undefined;
	"shell.error.pageNotFound": undefined;
	"shell.error.refresh": undefined;
	"shell.error.reportIssue": undefined;
	"shell.error.title": undefined;
}

export interface RichMessages {
	"feedback.requestBlocked.cloudflare.knownIssue": undefined;
}

export interface RichTags {
	"feedback.requestBlocked.cloudflare.knownIssue": "link";
}
