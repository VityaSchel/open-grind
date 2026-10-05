export interface Messages {
	"common.actions.close": undefined;
	"common.actions.retry": undefined;
	"common.time.hours": { count: number };
	"common.time.justNow": undefined;
	"common.time.minutes": { count: number };
	"feedback.errorCopy.copied": undefined;
	"feedback.errorCopy.errors.copyFailed": undefined;
	"feedback.errorToast.copyDetails": undefined;
	"feedback.errorToast.defaultLabel": undefined;
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
