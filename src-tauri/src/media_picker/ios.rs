use std::cell::{Cell, RefCell};
use std::sync::{Arc, Mutex};

use block2::RcBlock;
use objc2::rc::{Allocated, Retained};
use objc2::runtime::{NSObject, NSObjectProtocol, ProtocolObject};
use objc2::{
	define_class, extern_class, extern_methods, msg_send, DefinedClass,
	MainThreadMarker, MainThreadOnly,
};
use objc2_foundation::{NSArray, NSError, NSString, NSURL};
use objc2_photos_ui::{
	PHPickerConfiguration, PHPickerConfigurationAssetRepresentationMode,
	PHPickerConfigurationSelection, PHPickerFilter, PHPickerResult,
	PHPickerViewControllerDelegate,
};
use objc2_ui_kit::{
	UIAdaptivePresentationControllerDelegate, UIPresentationController,
	UIResponder, UIViewController,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tokio::sync::oneshot;

use crate::error::AppError;
use crate::upload::staged::StagedMedia;
use crate::MAIN_WINDOW_LABEL;

const IMAGE: &str = "public.image";
const MOVIE: &str = "public.movie";

const ALREADY_OPEN: &str = "The photo picker is already open";
const NO_MAIN_WINDOW: &str = "The main window is gone";
const OFF_MAIN_THREAD: &str =
	"The photo picker can only open on the main thread";
const NEVER_ANSWERED: &str = "The photo picker closed without an answer";
const NEVER_LOADED: &str = "A picked item never finished loading";
const NOT_MEDIA: &str = "That item isn't a photo or video";

thread_local! {
	static PICKING: RefCell<Option<Retained<PickerDelegate>>> =
		const { RefCell::new(None) };
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
	Image,
	Video,
	Media,
}

impl MediaKind {
	fn type_identifiers(self) -> &'static [&'static str] {
		match self {
			MediaKind::Image => &[IMAGE],
			MediaKind::Video => &[MOVIE],
			MediaKind::Media => &[IMAGE, MOVIE],
		}
	}

	fn filter(self) -> Retained<PHPickerFilter> {
		unsafe {
			match self {
				MediaKind::Image => PHPickerFilter::imagesFilter(),
				MediaKind::Video => PHPickerFilter::videosFilter(),
				MediaKind::Media => {
					PHPickerFilter::anyFilterMatchingSubfilters(
						&NSArray::from_retained_slice(&[
							PHPickerFilter::imagesFilter(),
							PHPickerFilter::videosFilter(),
						]),
					)
				}
			}
		}
	}
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedPick {
	id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Picked {
	picks: Vec<StagedPick>,
	failed: usize,
}

type Loading = oneshot::Receiver<Result<StagedPick, String>>;

type Answer = Result<Vec<Loading>, &'static str>;

struct Request {
	kind: MediaKind,
	multiple: bool,
	staged: Arc<StagedMedia>,
	answer: oneshot::Sender<Answer>,
}

struct Picking {
	kind: MediaKind,
	staged: Arc<StagedMedia>,
	answer: Cell<Option<oneshot::Sender<Answer>>>,
}

extern_class!(
	#[unsafe(super(UIViewController, UIResponder, NSObject))]
	#[thread_kind = MainThreadOnly]
	struct PHPickerViewController;
);

impl PHPickerViewController {
	extern_methods!(
		#[unsafe(method(initWithConfiguration:))]
		fn init_with_configuration(
			this: Allocated<Self>,
			configuration: &PHPickerConfiguration,
		) -> Retained<Self>;

		#[unsafe(method(setDelegate:))]
		fn set_delegate(
			&self,
			delegate: Option<
				&ProtocolObject<dyn PHPickerViewControllerDelegate>,
			>,
		);
	);
}

define_class!(
	#[unsafe(super(NSObject))]
	#[thread_kind = MainThreadOnly]
	#[ivars = Picking]
	struct PickerDelegate;

	unsafe impl NSObjectProtocol for PickerDelegate {}

	unsafe impl PHPickerViewControllerDelegate for PickerDelegate {
		#[unsafe(method(picker:didFinishPicking:))]
		fn picker_did_finish_picking(
			&self,
			picker: &PHPickerViewController,
			results: &NSArray<PHPickerResult>,
		) {
			let picking = self.ivars();
			if let Some(answer) = picking.answer.take() {
				let loading = results
					.iter()
					.map(|result| picking.load(&result))
					.collect();
				let _ = answer.send(Ok(loading));
			}
			let dismissed = RcBlock::new(|| drop(finish()));
			picker.dismissViewControllerAnimated_completion(
				true,
				Some(&dismissed),
			);
		}
	}

	unsafe impl UIAdaptivePresentationControllerDelegate for PickerDelegate {
		#[unsafe(method(presentationControllerDidDismiss:))]
		fn presentation_controller_did_dismiss(
			&self,
			_controller: &UIPresentationController,
		) {
			if let Some(answer) = self.ivars().answer.take() {
				let _ = answer.send(Ok(Vec::new()));
			}
			let _finished = finish();
		}
	}
);

fn finish() -> Option<Retained<PickerDelegate>> {
	PICKING.with(|current| current.borrow_mut().take())
}

impl PickerDelegate {
	fn new(mtm: MainThreadMarker, picking: Picking) -> Retained<Self> {
		let this = Self::alloc(mtm).set_ivars(picking);
		unsafe { msg_send![super(this), init] }
	}
}

impl Picking {
	fn load(&self, result: &PHPickerResult) -> Loading {
		let (loaded, loading) = oneshot::channel();
		let provider = unsafe { result.itemProvider() };
		let Some(type_identifier) = self
			.kind
			.type_identifiers()
			.iter()
			.map(|identifier| NSString::from_str(identifier))
			.find(|identifier| {
				provider.hasItemConformingToTypeIdentifier(identifier)
			})
		else {
			let _ = loaded.send(Err(NOT_MEDIA.to_owned()));
			return loading;
		};
		let staged = Arc::clone(&self.staged);
		let loaded = Mutex::new(Some(loaded));
		let handler =
			RcBlock::new(move |url: *mut NSURL, error: *mut NSError| {
				let outcome = match unsafe { url.as_ref() } {
					Some(url) => stage(&staged, url),
					None => Err(unsafe { error.as_ref() }.map_or_else(
						|| NEVER_LOADED.to_owned(),
						|error| error.localizedDescription().to_string(),
					)),
				};
				let sender =
					loaded.lock().ok().and_then(|mut loaded| loaded.take());
				if let Some(sender) = sender {
					let _ = sender.send(outcome);
				}
			});
		let _ = unsafe {
			provider.loadFileRepresentationForTypeIdentifier_completionHandler(
				&type_identifier,
				&handler,
			)
		};
		loading
	}
}

fn stage(staged: &StagedMedia, url: &NSURL) -> Result<StagedPick, String> {
	let path = url.to_file_path().ok_or_else(|| NOT_MEDIA.to_owned())?;
	let id = staged.adopt(&path).map_err(|error| error.to_string())?;
	Ok(StagedPick { id })
}

fn present(
	mtm: MainThreadMarker,
	host: Retained<UIViewController>,
	request: Request,
) {
	let Request {
		kind,
		multiple,
		staged,
		answer,
	} = request;
	if PICKING.with(|current| current.borrow().is_some()) {
		let _ = answer.send(Err(ALREADY_OPEN));
		return;
	}

	let configuration = unsafe { PHPickerConfiguration::new() };
	unsafe {
		configuration.setFilter(Some(&kind.filter()));
		configuration.setSelectionLimit(if multiple { 0 } else { 1 });
		configuration.setSelection(PHPickerConfigurationSelection::Ordered);
		configuration.setPreferredAssetRepresentationMode(
			PHPickerConfigurationAssetRepresentationMode::Compatible,
		);
	}
	let picker = PHPickerViewController::init_with_configuration(
		PHPickerViewController::alloc(mtm),
		&configuration,
	);
	let delegate = PickerDelegate::new(
		mtm,
		Picking {
			kind,
			staged,
			answer: Cell::new(Some(answer)),
		},
	);
	picker.set_delegate(Some(ProtocolObject::from_ref(&*delegate)));
	if let Some(presentation) = picker.presentationController() {
		unsafe {
			presentation.setDelegate(Some(ProtocolObject::from_ref(&*delegate)))
		};
	}

	PICKING.with(|current| *current.borrow_mut() = Some(delegate.clone()));
	crate::presenting::present_on_top(
		host,
		Retained::into_super(picker),
		move |shown| {
			if let Err(message) = shown {
				let _finished = finish();
				if let Some(answer) = delegate.ivars().answer.take() {
					let _ = answer.send(Err(message));
				}
			}
		},
	);
}

async fn collect(loading: Vec<Loading>) -> Picked {
	let mut picks = Vec::with_capacity(loading.len());
	let mut failed = 0;
	for load in loading {
		match load.await.unwrap_or_else(|_| Err(NEVER_LOADED.to_owned())) {
			Ok(pick) => picks.push(pick),
			Err(message) => {
				tracing::warn!(
					"[picker] a pick could not be loaded: {message}"
				);
				failed += 1;
			}
		}
	}
	Picked { picks, failed }
}

#[tauri::command]
pub async fn pick_ios_media(
	app: AppHandle,
	kind: MediaKind,
	multiple: bool,
) -> Result<Picked, AppError> {
	let staged = Arc::new(
		StagedMedia::of(&app)
			.map_err(|error| AppError::Media(error.to_string()))?,
	);
	let main = app
		.get_webview_window(MAIN_WINDOW_LABEL)
		.ok_or_else(|| AppError::Media(NO_MAIN_WINDOW.to_owned()))?;
	let (answer, answered) = oneshot::channel();
	let request = Request {
		kind,
		multiple,
		staged,
		answer,
	};
	main.with_webview(move |webview| {
		let host = webview.view_controller().cast::<UIViewController>();
		match (MainThreadMarker::new(), unsafe { Retained::retain(host) }) {
			(Some(mtm), Some(host)) => present(mtm, host, request),
			(None, _) => {
				let _ = request.answer.send(Err(OFF_MAIN_THREAD));
			}
			(Some(_), None) => {
				let _ = request.answer.send(Err(NO_MAIN_WINDOW));
			}
		}
	})
	.map_err(|error| AppError::Media(error.to_string()))?;

	let loading = answered
		.await
		.unwrap_or(Err(NEVER_ANSWERED))
		.map_err(|message| AppError::Media(message.to_owned()))?;
	Ok(collect(loading).await)
}
