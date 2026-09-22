use super::{POLL, POLL_BRIDGE, SCHEDULE};
use crate::pin_support::{kotlin_package, spaced_match, squashed, MANIFEST};

const NATIVE_POLL: &str = "external fun nativePoll";

fn poll_symbol() -> String {
	format!(
		"Java_{}_PushPoll_nativePoll",
		kotlin_package(POLL, "PushPoll.kt").replace('.', "_")
	)
}

fn jni_type(kotlin: &str) -> &'static str {
	match kotlin {
		"Long" => "jlong",
		"String?" => "jstring",
		other => panic!("the JNI pin has no JNI type for the Kotlin {other}"),
	}
}

type Parameter<'a> = (&'a str, &'a str);

fn snake_case(name: &str) -> String {
	let mut snake = String::new();
	for character in name.chars() {
		if character.is_uppercase() {
			snake.push('_');
		}
		snake.push(character.to_ascii_lowercase());
	}
	snake
}

fn parameters(list: &str) -> Vec<Parameter<'_>> {
	list.split(',')
		.map(str::trim)
		.filter(|parameter| !parameter.is_empty())
		.map(|parameter| {
			let (name, kind) = parameter.split_once(':').unwrap_or_else(|| {
				panic!("the parameter {parameter} declares no type")
			});
			(name.trim(), kind.trim())
		})
		.collect()
}

fn signature<'a>(
	source: &'a str,
	header: &str,
	returns: &str,
	end: char,
) -> (Vec<Parameter<'a>>, &'a str) {
	let found = spaced_match(source, header)
		.unwrap_or_else(|| panic!("no {header} to compare signatures with"));
	let rest = &source[found.end..];
	let open = rest
		.find('(')
		.unwrap_or_else(|| panic!("{header} has no parameter list"));
	let (list, after) = rest[open + 1..]
		.split_once(')')
		.unwrap_or_else(|| panic!("{header} has no closing parenthesis"));
	let answer = after
		.trim_start()
		.strip_prefix(returns)
		.unwrap_or_else(|| panic!("{header} declares no return type"));
	let answer = answer.split(end).next().unwrap_or_default().trim();
	(parameters(list), answer)
}

fn kotlin_signature<'a>(
	source: &'a str,
	header: &str,
) -> (Vec<Parameter<'a>>, &'a str) {
	signature(source, header, ":", '\n')
}

fn jni_signature<'a>(
	source: &'a str,
	header: &str,
) -> (Vec<Parameter<'a>>, &'a str) {
	let (mut parameters, answer) = signature(source, header, "->", '{');
	assert!(
		parameters.len() >= 2
			&& parameters[0].1.starts_with("JNIEnv")
			&& parameters[1].1.starts_with("JClass"),
		"{header} no longer starts with the JNIEnv and JClass every static JNI function takes"
	);
	(parameters.split_off(2), answer)
}

#[test]
fn a_signature_is_read_as_named_typed_parameters_in_order() {
	let kotlin =
		"external fun nativePoll(sinceInbox: Long,\n\tsinceTaps: Long,\n): String?\n";
	assert_eq!(
		kotlin_signature(kotlin, NATIVE_POLL),
		(
			vec![("sinceInbox", "Long"), ("sinceTaps", "Long")],
			"String?"
		)
	);
	let jni = "fn Java_x_nativePoll<'local>(\n\tenv: JNIEnv<'local>,\n\t_class: JClass<'local>,\n\tsince_inbox: jlong,\n) -> jstring {";
	assert_eq!(
		jni_signature(jni, "fn Java_x_nativePoll"),
		(vec![("since_inbox", "jlong")], "jstring")
	);
	assert_eq!(snake_case("sinceInbox"), "since_inbox");
}

#[test]
fn the_background_poll_is_reachable_from_the_job_that_runs_it() {
	assert!(
		spaced_match(POLL, NATIVE_POLL).is_some(),
		"PushPoll.kt no longer declares the native method the poll job calls"
	);
	let symbol = poll_symbol();
	assert!(
		squashed(POLL_BRIDGE)
			.contains(&format!("#[no_mangle]pubextern\"system\"fn{symbol}")),
		"push_poll/android.rs exports no {symbol}, so the poll job would die with UnsatisfiedLinkError"
	);
	assert!(
		squashed(POLL).contains("System.loadLibrary(\"open_grind_lib\")"),
		"PushPoll.kt no longer loads the library that defines nativePoll"
	);

	assert!(
		MANIFEST
			.contains("android:name=\"org.opengrind.push.PushPollService\"")
			&& MANIFEST.contains(
				"android:permission=\"android.permission.BIND_JOB_SERVICE\""
			),
		"a JobService Android cannot bind never polls"
	);
	let schedule = squashed(SCHEDULE);
	assert!(
		!schedule.contains("setPersisted(true)")
			|| MANIFEST.contains(
				"<uses-permission android:name=\"android.permission.RECEIVE_BOOT_COMPLETED\" />"
			),
		"setPersisted(true) throws without RECEIVE_BOOT_COMPLETED"
	);
	assert!(
		!schedule.contains("setRequiredNetworkType(")
			|| MANIFEST.contains(
				"<uses-permission android:name=\"android.permission.ACCESS_NETWORK_STATE\" />"
			),
		"a connectivity constraint throws SecurityException on Android 14 without ACCESS_NETWORK_STATE"
	);
}

#[test]
fn the_poll_bridge_takes_and_returns_what_kotlin_declares() {
	let (parameters, answer) = kotlin_signature(POLL, NATIVE_POLL);
	let symbol = poll_symbol();
	let (jni_parameters, jni_answer) =
		jni_signature(POLL_BRIDGE, &format!("fn {symbol}"));
	assert_eq!(
		jni_parameters
			.iter()
			.map(|(name, kind)| ((*name).to_owned(), *kind))
			.collect::<Vec<_>>(),
		parameters
			.iter()
			.map(|(name, kind)| (snake_case(name), jni_type(kind)))
			.collect::<Vec<_>>(),
		"push_poll/android.rs {symbol} reads different parameters, or the same ones in another order, than PushPoll.kt passes, so it would link and read garbage"
	);
	assert_eq!(
		jni_answer,
		jni_type(answer),
		"push_poll/android.rs {symbol} returns something other than the {answer} PushPoll.kt expects"
	);
}

#[test]
fn each_watermark_reaches_the_poll_under_its_own_name() {
	assert!(
		squashed(POLL).contains(
			"nativePoll(sinceInbox=watermarks.inbox,sinceTaps=watermarks.taps)"
		),
		"PushPoll.kt no longer passes each watermark to nativePoll by name, so the two can swap unnoticed"
	);
	assert!(
		squashed(POLL_BRIDGE)
			.contains("Watermarks{inbox:since_inbox,taps:since_taps"),
		"push_poll/android.rs no longer reads each watermark from the parameter of the same name"
	);
}
