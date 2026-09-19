use jni::objects::JClass;
use jni::sys::{jlong, jstring};
use jni::JNIEnv;

use super::session::{client, collect};
use crate::storage;

#[no_mangle]
pub extern "system" fn Java_org_opengrind_push_PushPoll_nativePoll<'local>(
	env: JNIEnv<'local>,
	_class: JClass<'local>,
	since: jlong,
) -> jstring {
	let polled =
		std::panic::catch_unwind(|| polled(since)).unwrap_or_else(|_| {
			tracing::error!("[poll] panicked");
			super::Poll {
				watermark: since,
				pushes: Vec::new(),
			}
		});
	let poll = serde_json::to_string(&polled).unwrap_or_default();
	env.new_string(poll)
		.map(|handle| handle.into_raw())
		.unwrap_or(std::ptr::null_mut())
}

fn polled(since: jlong) -> super::Poll {
	let empty = super::Poll {
		watermark: since,
		pushes: Vec::new(),
	};
	storage::init_keyring();
	let Some(client) = client() else {
		return empty;
	};
	let runtime = tokio::runtime::Builder::new_current_thread()
		.enable_all()
		.build();
	match runtime {
		Ok(runtime) => runtime.block_on(collect(&client, since)),
		Err(e) => {
			tracing::warn!("[poll] no runtime: {e}");
			empty
		}
	}
}
