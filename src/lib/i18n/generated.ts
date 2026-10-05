export interface Messages {
	"common.actions.close": undefined;
	"common.actions.retry": undefined;
	"common.time.hours": { count: number };
	"common.time.justNow": undefined;
	"common.time.minutes": { count: number };
}

export interface RichMessages {
	"feedback.requestBlocked.cloudflare.knownIssue": undefined;
}

export interface RichTags {
	"feedback.requestBlocked.cloudflare.knownIssue": "link";
}
