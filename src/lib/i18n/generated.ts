export interface Messages {
	"browse.filters.ageAndOver": { count: number };
	"browse.filters.noMax": undefined;
	"browse.filters.noMin": undefined;
	"browse.filters.withinDistance": { distance: string };
	"common.actions.close": undefined;
	"common.actions.retry": undefined;
	"common.format.range": { max: string; min: string };
	"common.time.hours": { count: number };
	"common.time.justNow": undefined;
	"common.time.minutes": { count: number };
	"common.time.today": undefined;
	"common.time.yesterday": undefined;
	"common.units.feetInches": { feet: string; inches: string };
	"feedback.apiError.connect": undefined;
	"feedback.apiError.http": undefined;
	"feedback.apiError.networkBlocked": undefined;
	"feedback.apiError.requestBlocked": undefined;
	"feedback.apiError.sessionStale": undefined;
	"feedback.appError.connectionFailed": undefined;
	"feedback.appError.contentTooLarge": undefined;
	"feedback.appError.notSignedIn": undefined;
	"feedback.appError.overLimit": { limit: string };
	"feedback.appError.rateLimited": undefined;
	"feedback.appError.titledWebPage": { title: string };
	"feedback.appError.unknown": undefined;
	"feedback.appError.webPage": undefined;
	"feedback.appError.withCode": { code: string; detail: string };
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
	"profile.fields.lastTested": undefined;
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
