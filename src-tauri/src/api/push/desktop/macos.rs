use std::ptr::NonNull;
use std::sync::{Mutex, OnceLock};

use block2::{DynBlock, RcBlock};
use objc2::rc::Retained;
use objc2::runtime::{Bool, NSObject, NSObjectProtocol, ProtocolObject};
use objc2::{define_class, msg_send, AllocAnyThread, DefinedClass};
use objc2_foundation::{NSArray, NSBundle, NSError, NSString};
use objc2_user_notifications::{
	UNAuthorizationOptions, UNAuthorizationStatus,
	UNMutableNotificationContent, UNNotification,
	UNNotificationDefaultActionIdentifier, UNNotificationPresentationOptions,
	UNNotificationRequest, UNNotificationResponse, UNNotificationSettings,
	UNNotificationSound, UNUserNotificationCenter,
	UNUserNotificationCenterDelegate,
};
use tauri::AppHandle;
use tokio::sync::oneshot;

use super::super::{
	Announcement, NotificationPermission, NotificationPermissionState,
	PushError,
};

const SETTINGS_PANE: &str =
	"x-apple.systempreferences:com.apple.Notifications-Settings.extension";

pub fn settings_url(app: &AppHandle) -> Option<String> {
	Some(format!("{SETTINGS_PANE}?id={}", app.config().identifier))
}

define_class!(
	#[unsafe(super(NSObject))]
	#[name = "OpenGrindNotificationDelegate"]
	#[ivars = AppHandle]
	struct Delegate;

	unsafe impl NSObjectProtocol for Delegate {}

	unsafe impl UNUserNotificationCenterDelegate for Delegate {
		#[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
		fn will_present(
			&self,
			_center: &UNUserNotificationCenter,
			_notification: &UNNotification,
			completion: &DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
		) {
			completion.call((UNNotificationPresentationOptions::Banner
				| UNNotificationPresentationOptions::List
				| UNNotificationPresentationOptions::Sound,));
		}

		#[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
		fn did_receive(
			&self,
			_center: &UNUserNotificationCenter,
			response: &UNNotificationResponse,
			completion: &DynBlock<dyn Fn()>,
		) {
			let opened = response.actionIdentifier().isEqualToString(unsafe {
				UNNotificationDefaultActionIdentifier
			});
			if opened {
				let tag = response.notification().request().identifier();
				super::open(self.ivars(), &tag.to_string(), None);
			}
			completion.call(());
		}
	}
);

fn bundled_center() -> Option<Retained<UNUserNotificationCenter>> {
	NSBundle::mainBundle().bundleIdentifier()?;
	Some(UNUserNotificationCenter::currentNotificationCenter())
}

fn once<T: Send + 'static>(
	sent: oneshot::Sender<T>,
) -> impl Fn(T) + Send + Sync + 'static {
	let sent = Mutex::new(Some(sent));
	move |value| {
		if let Some(sent) = sent.lock().unwrap().take() {
			let _ = sent.send(value);
		}
	}
}

pub fn install(app: &AppHandle) {
	static DELEGATE: OnceLock<Retained<Delegate>> = OnceLock::new();
	let Some(center) = bundled_center() else {
		tracing::warn!("[push] no bundle identifier, notifications are off");
		return;
	};
	let delegate = DELEGATE.get_or_init(|| {
		let delegate = Delegate::alloc().set_ivars(app.clone());
		unsafe { msg_send![super(delegate), init] }
	});
	center.setDelegate(Some(ProtocolObject::from_ref(&**delegate)));
}

fn deliver(
	announcement: &Announcement,
) -> Result<oneshot::Receiver<bool>, PushError> {
	let center = bundled_center().ok_or(PushError::UnsupportedPlatform)?;
	let content = UNMutableNotificationContent::new();
	content.setTitle(&NSString::from_str(&announcement.title));
	content.setBody(&NSString::from_str(&announcement.body));
	content.setSound(Some(&UNNotificationSound::defaultSound()));
	let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
		&NSString::from_str(&announcement.tag),
		&content,
		None,
	);
	let (sent, delivered) = oneshot::channel();
	let send = once(sent);
	let completion =
		RcBlock::new(move |error: *mut NSError| send(error.is_null()));
	center.addNotificationRequest_withCompletionHandler(
		&request,
		Some(&completion),
	);
	Ok(delivered)
}

pub async fn show(
	_app: &AppHandle,
	announcement: &Announcement,
) -> Result<(), PushError> {
	match deliver(announcement)?.await {
		Ok(true) => Ok(()),
		_ => Err(PushError::Failed),
	}
}

pub fn withdraw(_app: &AppHandle, tags: &[String]) {
	let Some(center) = bundled_center() else {
		return;
	};
	let identifiers: Vec<Retained<NSString>> =
		tags.iter().map(|tag| NSString::from_str(tag)).collect();
	center.removeDeliveredNotificationsWithIdentifiers(
		&NSArray::from_retained_slice(&identifiers),
	);
}

fn list_delivered() -> Option<oneshot::Receiver<Vec<String>>> {
	let center = bundled_center()?;
	let (sent, listed) = oneshot::channel();
	let send = once(sent);
	let completion =
		RcBlock::new(move |delivered: NonNull<NSArray<UNNotification>>| {
			let tags = unsafe { delivered.as_ref() }
				.to_vec()
				.iter()
				.map(|notification| {
					notification.request().identifier().to_string()
				})
				.collect();
			send(tags);
		});
	center.getDeliveredNotificationsWithCompletionHandler(&completion);
	Some(listed)
}

pub async fn delivered(_app: &AppHandle) -> Option<Vec<String>> {
	list_delivered()?.await.ok()
}

fn permission_of(status: UNAuthorizationStatus) -> NotificationPermission {
	match status {
		UNAuthorizationStatus::NotDetermined => NotificationPermission {
			granted: false,
			state: NotificationPermissionState::Prompt,
		},
		UNAuthorizationStatus::Denied => NotificationPermission::settled(false),
		_ => NotificationPermission::settled(true),
	}
}

fn read_settings() -> Result<oneshot::Receiver<UNAuthorizationStatus>, PushError>
{
	let center = bundled_center().ok_or(PushError::UnsupportedPlatform)?;
	let (sent, read) = oneshot::channel();
	let send = once(sent);
	let completion =
		RcBlock::new(move |settings: NonNull<UNNotificationSettings>| {
			send(unsafe { settings.as_ref() }.authorizationStatus());
		});
	center.getNotificationSettingsWithCompletionHandler(&completion);
	Ok(read)
}

pub async fn permission(
	_app: &AppHandle,
) -> Result<NotificationPermission, PushError> {
	let status = read_settings()?.await.map_err(|_| PushError::Failed)?;
	Ok(permission_of(status))
}

fn ask() -> Result<oneshot::Receiver<bool>, PushError> {
	let center = bundled_center().ok_or(PushError::UnsupportedPlatform)?;
	let (sent, answered) = oneshot::channel();
	let send = once(sent);
	let completion =
		RcBlock::new(move |granted: Bool, _error: *mut NSError| {
			send(granted.as_bool());
		});
	center.requestAuthorizationWithOptions_completionHandler(
		UNAuthorizationOptions::Alert | UNAuthorizationOptions::Sound,
		&completion,
	);
	Ok(answered)
}

pub async fn request_permission(
	app: &AppHandle,
) -> Result<NotificationPermission, PushError> {
	let _ = ask()?.await;
	permission(app).await
}
