use std::ffi::c_void;
use std::io;

use sha2::{Digest, Sha256};
use tauri::AppHandle;
use uuid::{Builder, Uuid};
use windows::core::{
	implement, IUnknown, Interface, Ref, Result, BOOL, GUID, HSTRING, PCWSTR,
};
use windows::Win32::Foundation::CLASS_E_NOAGGREGATION;
use windows::Win32::System::Com::{
	CoInitializeEx, CoRegisterClassObject, IClassFactory, IClassFactory_Impl,
	CLSCTX_LOCAL_SERVER, COINIT_MULTITHREADED, REGCLS_MULTIPLEUSE,
};
use windows::Win32::System::Registry::{
	RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ,
};
use windows::Win32::UI::Notifications::{
	INotificationActivationCallback, INotificationActivationCallback_Impl,
	NOTIFICATION_USER_INPUT_DATA,
};

#[implement(INotificationActivationCallback)]
struct Activator {
	app: AppHandle,
}

impl INotificationActivationCallback_Impl for Activator_Impl {
	fn Activate(
		&self,
		_app_id: &PCWSTR,
		arguments: &PCWSTR,
		_inputs: *const NOTIFICATION_USER_INPUT_DATA,
		_count: u32,
	) -> Result<()> {
		let arguments = if arguments.is_null() {
			String::new()
		} else {
			unsafe { arguments.to_string() }.unwrap_or_default()
		};
		super::activated(&self.app, &arguments);
		Ok(())
	}
}

#[implement(IClassFactory)]
struct Factory {
	app: AppHandle,
}

impl IClassFactory_Impl for Factory_Impl {
	fn CreateInstance(
		&self,
		outer: Ref<'_, IUnknown>,
		iid: *const GUID,
		object: *mut *mut c_void,
	) -> Result<()> {
		if !outer.is_null() {
			return Err(CLASS_E_NOAGGREGATION.into());
		}
		let activator: IUnknown = Activator {
			app: self.app.clone(),
		}
		.into();
		unsafe { activator.query(iid, object) }.ok()
	}

	fn LockServer(&self, _lock: BOOL) -> Result<()> {
		Ok(())
	}
}

pub fn install(app: &AppHandle) {
	let id = activator_id(&app.config().identifier);
	if !tauri::is_dev() {
		if let Err(error) = link(&app.config().identifier, &id) {
			tracing::warn!(
				"[push] the Action Center cannot open the app: {error}"
			);
		}
	}
	let app = app.clone();
	std::thread::spawn(move || serve(app, GUID::from_u128(id.as_u128())));
}

fn activator_id(app_id: &str) -> Uuid {
	let digest = Sha256::digest(app_id);
	let mut bytes = [0; 16];
	bytes.copy_from_slice(&digest[..16]);
	Builder::from_custom_bytes(bytes).into_uuid()
}

fn link(app_id: &str, id: &Uuid) -> io::Result<()> {
	let id = format!("{:X}", id.braced());
	let server =
		format!("\"{}\" -ToastActivated", std::env::current_exe()?.display());
	set_string(
		&format!(r"Software\Classes\CLSID\{id}\LocalServer32"),
		"",
		&server,
	)?;
	set_string(
		&format!(r"Software\Classes\AppUserModelId\{app_id}"),
		"CustomActivator",
		&id,
	)?;
	Ok(())
}

fn set_string(key: &str, name: &str, value: &str) -> Result<()> {
	let data: Vec<u16> = value.encode_utf16().chain([0]).collect();
	unsafe {
		RegSetKeyValueW(
			HKEY_CURRENT_USER,
			&HSTRING::from(key),
			&HSTRING::from(name),
			REG_SZ.0,
			Some(data.as_ptr().cast()),
			u32::try_from(data.len() * size_of::<u16>()).unwrap_or(u32::MAX),
		)
	}
	.ok()
}

fn serve(app: AppHandle, id: GUID) {
	let factory: IClassFactory = Factory { app }.into();
	let served = unsafe {
		CoInitializeEx(None, COINIT_MULTITHREADED)
			.ok()
			.and_then(|()| {
				CoRegisterClassObject(
					&id,
					&factory,
					CLSCTX_LOCAL_SERVER,
					REGCLS_MULTIPLEUSE,
				)
			})
	};
	if let Err(error) = served {
		tracing::warn!("[push] the Action Center cannot open the app: {error}");
		return;
	}
	loop {
		std::thread::park();
	}
}
