mod contract;
mod gate;
mod settings;

const BRIDGE: &str = include_str!("android.rs");

const PLUGIN: &str = include_str!(
	"../../../gen/android/app/src/main/java/org/opengrind/push/PushPlugin.kt"
);

const CONTRACT: &str = include_str!(
	"../../../gen/android/app/src/main/java/org/opengrind/push/PushContract.kt"
);

const FCM_REQUEST: &str = include_str!(
	"../../../gen/android/app/src/main/java/org/opengrind/push/FcmRequest.kt"
);

const NOTIFIER: &str = include_str!(
	"../../../gen/android/app/src/main/java/org/opengrind/push/PushNotifier.kt"
);

const POLL: &str = include_str!(
	"../../../gen/android/app/src/main/java/org/opengrind/push/PushPoll.kt"
);

const POLL_SERVICE: &str = include_str!(
	"../../../gen/android/app/src/main/java/org/opengrind/push/PushPollService.kt"
);

const SCHEDULE: &str = include_str!(
	"../../../gen/android/app/src/main/java/org/opengrind/push/PushSchedule.kt"
);

const EVENTS: &str = include_str!(
	"../../../gen/android/app/src/main/java/org/opengrind/push/PushEvents.kt"
);

const MODE: &str = include_str!(
	"../../../android-logic/src/main/kotlin/org/opengrind/push/PushMode.kt"
);

const CATEGORIES: &str = include_str!(
	"../../../android-logic/src/main/kotlin/org/opengrind/push/PushCategories.kt"
);

const TYPES_TS: &str = include_str!("../../../../src/lib/push/types.ts");
