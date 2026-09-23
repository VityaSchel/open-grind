use jni::objects::JClass;
use jni::sys::{jlong, jstring};
use jni::JNIEnv;

use super::session::{client, collect};
use super::{Poll, Watermarks};
use crate::storage;

#[no_mangle]
pub extern "system" fn Java_org_opengrind_push_PushPoll_nativePoll<'local>(
	env: JNIEnv<'local>,
	_class: JClass<'local>,
	since_inbox: jlong,
	since_taps: jlong,
) -> jstring {
	let since = Watermarks {
		inbox: since_inbox,
		taps: since_taps,
	};
	let polled =
		std::panic::catch_unwind(|| polled(since)).unwrap_or_else(|_| {
			tracing::error!("[poll] panicked");
			Poll::unchanged(since)
		});
	let poll = serde_json::to_string(&polled).unwrap_or_default();
	env.new_string(poll)
		.map(|handle| handle.into_raw())
		.unwrap_or(std::ptr::null_mut())
}

fn polled(since: Watermarks) -> Poll {
	storage::init_keyring();
	let Some(client) = client() else {
		return Poll::unchanged(since);
	};
	let runtime = tokio::runtime::Builder::new_current_thread()
		.enable_all()
		.build();
	match runtime {
		Ok(runtime) => runtime.block_on(collect(&client, since)),
		Err(e) => {
			tracing::warn!("[poll] no runtime: {e}");
			Poll::unchanged(since)
		}
	}
}
