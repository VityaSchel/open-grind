#[cfg(target_os = "android")]
mod android;
#[cfg(desktop)]
mod desktop;
#[cfg(target_os = "ios")]
mod ios;
#[cfg(any(target_os = "android", desktop))]
mod progress;

use tauri::{AppHandle, Runtime};

#[cfg(any(target_os = "android", desktop))]
use crate::api::update::InstallKind;
#[cfg(target_os = "android")]
use android as platform;
#[cfg(desktop)]
use desktop as platform;
#[cfg(target_os = "ios")]
use ios as platform;
#[cfg(any(target_os = "android", desktop))]
pub use progress::TransferProgress;

#[cfg(any(target_os = "android", test))]
const MEDIA_UPLOAD: &str = "mediaUpload";

#[cfg_attr(desktop, allow(dead_code))]
#[derive(Debug, Clone, Copy)]
pub enum TransferPurpose {
	#[cfg(any(target_os = "android", desktop))]
	Update {
		package_name: &'static str,
		kind: InstallKind,
	},
	MediaUpload,
}

pub struct TransferHold<'a, R: Runtime> {
	app: &'a AppHandle<R>,
	purpose: TransferPurpose,
	#[cfg(any(target_os = "android", desktop))]
	reported: Option<(TransferProgress, std::time::Instant)>,
}

impl<'a, R: Runtime> TransferHold<'a, R> {
	pub fn media_upload(app: &'a AppHandle<R>) -> Self {
		Self::begin(app, TransferPurpose::MediaUpload)
	}

	pub(crate) fn begin(
		app: &'a AppHandle<R>,
		purpose: TransferPurpose,
	) -> Self {
		platform::begin_transfer(app, purpose);
		Self {
			app,
			purpose,
			#[cfg(any(target_os = "android", desktop))]
			reported: None,
		}
	}
}

impl<R: Runtime> Drop for TransferHold<'_, R> {
	fn drop(&mut self) {
		platform::end_transfer(self.app, self.purpose);
	}
}

#[cfg(test)]
mod pins {
	use crate::pin_support::{kotlin_constant, squashed};

	const TRANSFER_TITLE: &str = include_str!(
		"../../android-logic/src/main/kotlin/org/opengrind/update/TransferTitle.kt"
	);

	const TRANSFER_SERVICE: &str = include_str!(
		"../../gen/android/app/src/main/java/org/opengrind/update/TransferService.kt"
	);

	#[test]
	fn a_media_upload_holds_the_transfer_service_under_its_own_title() {
		assert_eq!(
			kotlin_constant(TRANSFER_TITLE, "TransferTitle.kt", "MEDIA_UPLOAD"),
			super::MEDIA_UPLOAD,
			"the upload purpose the bridge sends is not the one TransferTitle reads"
		);
		let service = squashed(TRANSFER_SERVICE);
		assert!(
			service.contains(
				"funstart(context:Context,transfer:Transfer,){holds.begin(transfer)context.startForegroundService("
			),
			"TransferService no longer restarts on every hold"
		);
		assert!(
			service.contains(
				"funstop(context:Context,transfer:Transfer,){holds.end(transfer)ContextCompat.getMainExecutor(context).execute{running?.get()?.settle()}}"
			) && !service.contains("stopService("),
			"TransferService is stopped from outside instead of stopping itself on the main thread"
		);
		assert!(
			service.contains(
				"}catch(e:Exception){stopIfLatest(startId)returnSTART_NOT_STICKY}foregroundStartId=startIdsettle()"
			) && service.contains(
				"privatefunsettle(){valstartId=foregroundStartId?:returnvalshowing=holds.newest()if(showing==null){stopIfLatest(startId)return}"
			),
			"TransferService can stop before it entered the foreground or while a transfer still runs"
		);
	}
}
