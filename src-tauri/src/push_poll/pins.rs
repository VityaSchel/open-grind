mod native_poll;
mod poll;

const POLL_BRIDGE: &str = include_str!("android.rs");

const POLL: &str = include_str!(
	"../../gen/android/app/src/main/java/org/opengrind/push/PushPoll.kt"
);

const POLL_SERVICE: &str = include_str!(
	"../../gen/android/app/src/main/java/org/opengrind/push/PushPollService.kt"
);

const SCHEDULE: &str = include_str!(
	"../../gen/android/app/src/main/java/org/opengrind/push/PushSchedule.kt"
);

const PAYLOAD: &str = include_str!(
	"../../android-logic/src/main/kotlin/org/opengrind/push/PushPayload.kt"
);

const STRINGS: &str = include_str!(
	"../../android-logic/src/main/kotlin/org/opengrind/push/PushStrings.kt"
);
