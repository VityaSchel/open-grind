use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, WebviewWindow};
use windows::core::{Interface, HSTRING, PCWSTR};
use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
use windows::Win32::Storage::EnhancedStorage::PKEY_AppUserModel_ID;
use windows::Win32::System::Com::StructuredStorage::PropVariantToStringAlloc;
use windows::Win32::System::Com::{
	CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize,
	IPersistFile, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
	STGM_READWRITE,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Registry::{
	RegCloseKey, RegCreateKeyW, RegDeleteKeyW, RegOpenKeyExW, RegSetValueExW,
	HKEY, HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE, REG_SZ,
};
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
use windows::Win32::UI::Shell::{
	FOLDERID_AppsFolder, FOLDERID_Desktop, FOLDERID_Programs,
	FOLDERID_UserPinned, IShellItem, IShellLinkW, ITaskbarList, SHChangeNotify,
	SHCreateItemInKnownFolder, SHGetKnownFolderPath, ShellLink, TaskbarList,
	KF_FLAG_DEFAULT, SHCNE_ASSOCCHANGED, SHCNE_DELETE, SHCNE_RENAMEITEM,
	SHCNE_UPDATEITEM, SHCNF_IDLIST, SHCNF_PATHW, SIGDN_NORMALDISPLAY,
};
use windows::Win32::UI::WindowsAndMessaging::{
	GetForegroundWindow, GetSystemMetrics, LoadImageW, SendMessageW, HICON,
	ICON_BIG, ICON_SMALL, IMAGE_FLAGS, IMAGE_ICON, LR_DEFAULTCOLOR,
	LR_LOADFROMFILE, SM_CXICON, SM_CXSMICON, WM_SETICON,
};

use super::desktop::{icons_dir, window_title};
use super::{icon, DisguiseError, Preset};

const EXE_ICON_RESOURCE: u16 = 32512;
const SHORTCUTS_KEY: &str = "Disguise";
const LISTING_POLL: Duration = Duration::from_millis(250);
const LISTING_WAIT: Duration = Duration::from_secs(15);
const BUTTON_GAP: Duration = Duration::from_millis(300);

impl From<windows::core::Error> for DisguiseError {
	fn from(error: windows::core::Error) -> Self {
		Self(error.message())
	}
}

struct Shortcut {
	path: PathBuf,
	renames: bool,
}

fn known_folder(id: &windows::core::GUID) -> Option<PathBuf> {
	unsafe {
		let path = SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None).ok()?;
		let folder = path.to_string().ok().map(PathBuf::from);
		CoTaskMemFree(Some(path.0.cast()));
		folder
	}
}

fn link_files(dir: &Path, depth: usize) -> Vec<PathBuf> {
	let Ok(entries) = fs::read_dir(dir) else {
		return Vec::new();
	};
	let mut links = Vec::new();
	for path in entries.filter_map(Result::ok).map(|entry| entry.path()) {
		if path.is_dir() && depth > 0 {
			links.extend(link_files(&path, depth - 1));
		} else if path
			.extension()
			.is_some_and(|kind| kind.eq_ignore_ascii_case("lnk"))
		{
			links.push(path);
		}
	}
	links
}

fn candidates() -> Vec<Shortcut> {
	let renamed = [FOLDERID_Programs, FOLDERID_Desktop]
		.iter()
		.filter_map(known_folder)
		.flat_map(|dir| link_files(&dir, 1))
		.map(|path| Shortcut {
			path,
			renames: true,
		});
	let pinned = known_folder(&FOLDERID_UserPinned)
		.map(|dir| link_files(&dir.join("TaskBar"), 0))
		.unwrap_or_default()
		.into_iter()
		.map(|path| Shortcut {
			path,
			renames: false,
		});
	renamed.chain(pinned).collect()
}

fn open_link(
	path: &Path,
) -> windows::core::Result<(IShellLinkW, IPersistFile)> {
	unsafe {
		let link: IShellLinkW =
			CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
		let file: IPersistFile = link.cast()?;
		file.Load(&HSTRING::from(path), STGM_READWRITE)?;
		Ok((link, file))
	}
}

fn app_user_model_id(link: &IShellLinkW) -> Option<String> {
	unsafe {
		let store: IPropertyStore = link.cast().ok()?;
		let value = store.GetValue(&PKEY_AppUserModel_ID).ok()?;
		let text = PropVariantToStringAlloc(&value).ok()?;
		let id = text.to_string().ok();
		CoTaskMemFree(Some(text.0.cast()));
		id
	}
}

fn file_name(name: &str) -> String {
	let cleaned: String = name
		.chars()
		.map(|c| {
			if "<>:\"/\\|?*".contains(c) || c.is_control() {
				'-'
			} else {
				c
			}
		})
		.collect();
	format!("{}.lnk", cleaned.trim_end_matches(['.', ' ']))
}

fn notify(
	event: windows::Win32::UI::Shell::SHCNE_ID,
	from: &Path,
	to: Option<&Path>,
) {
	let from = HSTRING::from(from);
	let to = to.map(HSTRING::from);
	unsafe {
		SHChangeNotify(
			event,
			SHCNF_PATHW,
			Some(from.as_ptr().cast()),
			to.as_ref().map(|to| to.as_ptr().cast()),
		);
	}
}

fn belongs_to(shortcut: &Path, aumid: &str) -> bool {
	open_link(shortcut).is_ok_and(|(link, _)| {
		app_user_model_id(&link).as_deref() == Some(aumid)
	})
}

fn update_shortcuts(
	aumid: &str,
	name: &str,
	icon: &Path,
) -> Result<Vec<PathBuf>, DisguiseError> {
	let wanted = file_name(name);
	let mut renamed = Vec::new();
	for shortcut in candidates() {
		let Ok((link, file)) = open_link(&shortcut.path) else {
			continue;
		};
		if app_user_model_id(&link).as_deref() != Some(aumid) {
			continue;
		}
		unsafe {
			link.SetIconLocation(&HSTRING::from(icon), 0)?;
			file.Save(PCWSTR::null(), true)?;
		}
		notify(SHCNE_UPDATEITEM, &shortcut.path, None);
		if !shortcut.renames {
			continue;
		}
		let target = shortcut.path.with_file_name(&wanted);
		if target == shortcut.path {
			renamed.push(target);
		} else if !target.exists() {
			fs::rename(&shortcut.path, &target)?;
			notify(SHCNE_RENAMEITEM, &shortcut.path, Some(&target));
			renamed.push(target);
		} else if belongs_to(&target, aumid) {
			fs::remove_file(&shortcut.path)?;
			notify(SHCNE_DELETE, &shortcut.path, None);
		} else {
			renamed.push(shortcut.path);
		}
	}
	unsafe { SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None) };
	Ok(renamed)
}

fn with_com<T: Send + 'static>(
	work: impl FnOnce() -> Result<T, DisguiseError> + Send + 'static,
) -> Result<T, DisguiseError> {
	std::thread::spawn(move || {
		let initialized =
			unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
		let result = work();
		if initialized.is_ok() {
			unsafe { CoUninitialize() };
		}
		result
	})
	.join()
	.map_err(|_| DisguiseError::new("the shortcut update crashed"))?
}

fn set_string(key: HKEY, name: &str, value: &str) -> Result<(), DisguiseError> {
	let data: Vec<u16> = value.encode_utf16().chain([0]).collect();
	unsafe {
		RegSetValueExW(
			key,
			&HSTRING::from(name),
			None,
			REG_SZ,
			Some(std::slice::from_raw_parts(
				data.as_ptr().cast(),
				data.len() * 2,
			)),
		)
		.ok()?;
	}
	Ok(())
}

fn with_key(
	path: &str,
	create: bool,
	work: impl FnOnce(HKEY) -> Result<(), DisguiseError>,
) -> Result<(), DisguiseError> {
	let mut key = HKEY::default();
	let opened = unsafe {
		if create {
			RegCreateKeyW(HKEY_CURRENT_USER, &HSTRING::from(path), &mut key)
		} else {
			RegOpenKeyExW(
				HKEY_CURRENT_USER,
				&HSTRING::from(path),
				None,
				KEY_READ | KEY_SET_VALUE,
				&mut key,
			)
		}
	};
	if opened.is_err() {
		return Ok(());
	}
	let result = work(key);
	unsafe {
		let _ = RegCloseKey(key);
	}
	result
}

fn app_key(app: &AppHandle) -> String {
	format!(r"Software\{}", app.config().identifier)
}

fn record_shortcuts(
	app: &AppHandle,
	shortcuts: &[PathBuf],
) -> Result<(), DisguiseError> {
	let path = format!(r"{}\{SHORTCUTS_KEY}", app_key(app));
	unsafe {
		let _ = RegDeleteKeyW(HKEY_CURRENT_USER, &HSTRING::from(&path));
	}
	if shortcuts.is_empty() {
		return Ok(());
	}
	with_key(&path, true, |key| {
		for (index, shortcut) in shortcuts.iter().enumerate() {
			set_string(
				key,
				&format!("Shortcut{index}"),
				&shortcut.to_string_lossy(),
			)?;
		}
		Ok(())
	})
}

fn update_uninstall_entry(
	app: &AppHandle,
	name: &str,
	icon: &str,
) -> Result<(), DisguiseError> {
	let path = format!(
		r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{}",
		app.package_info().name
	);
	with_key(&path, false, |key| {
		set_string(key, "DisplayName", name)?;
		set_string(key, "DisplayIcon", icon)
	})
}

fn write_icon(
	app: &AppHandle,
	chosen: Option<&Preset>,
) -> Result<Option<PathBuf>, DisguiseError> {
	let dir = icons_dir(app)?;
	let target = chosen.map(|preset| dir.join(format!("{}.ico", preset.id)));
	if let Ok(entries) = fs::read_dir(&dir) {
		for entry in entries.filter_map(Result::ok) {
			if Some(entry.path()) != target {
				let _ = fs::remove_file(entry.path());
			}
		}
	}
	let (Some(preset), Some(target)) = (chosen, &target) else {
		return Ok(None);
	};
	if !target.exists() {
		fs::create_dir_all(&dir)?;
		fs::write(target, icon(preset))?;
	}
	Ok(Some(target.clone()))
}

struct Look {
	name: String,
	icon: PathBuf,
	exe: PathBuf,
}

fn look(
	app: &AppHandle,
	chosen: Option<&'static Preset>,
) -> Result<Look, DisguiseError> {
	let exe = std::env::current_exe()?;
	Ok(Look {
		name: window_title(app, chosen),
		icon: write_icon(app, chosen)?.unwrap_or_else(|| exe.clone()),
		exe,
	})
}

fn update_installation(
	app: &AppHandle,
	chosen: Option<&'static Preset>,
	look: &Look,
) -> Result<bool, DisguiseError> {
	let aumid = app.config().identifier.clone();
	let shortcuts = {
		let (name, icon) = (look.name.clone(), look.icon.clone());
		with_com(move || update_shortcuts(&aumid, &name, &icon))?
	};
	record_shortcuts(app, if chosen.is_some() { &shortcuts } else { &[] })?;
	let display_icon = match chosen {
		Some(_) => look.icon.to_string_lossy().into_owned(),
		None => format!("\"{}\"", look.exe.display()),
	};
	update_uninstall_entry(app, &look.name, &display_icon)?;
	Ok(!shortcuts.is_empty())
}

fn listed_name(aumid: &str) -> Option<String> {
	unsafe {
		let item: IShellItem = SHCreateItemInKnownFolder(
			&FOLDERID_AppsFolder,
			KF_FLAG_DEFAULT,
			&HSTRING::from(aumid),
		)
		.ok()?;
		let name = item.GetDisplayName(SIGDN_NORMALDISPLAY).ok()?;
		let text = name.to_string().ok();
		CoTaskMemFree(Some(name.0.cast()));
		text
	}
}

fn readd_taskbar_button(hwnd: HWND) -> windows::core::Result<()> {
	unsafe {
		let taskbar: ITaskbarList =
			CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER)?;
		taskbar.HrInit()?;
		taskbar.DeleteTab(hwnd)?;
		std::thread::sleep(BUTTON_GAP);
		taskbar.AddTab(hwnd)?;
		if GetForegroundWindow() == hwnd {
			taskbar.ActivateTab(hwnd)?;
		}
	}
	Ok(())
}

fn refresh_taskbar_button(
	window: &WebviewWindow,
	aumid: String,
	name: &str,
) -> Result<(), DisguiseError> {
	let hwnd = window.hwnd()?.0 as isize;
	let listed = file_name(name).trim_end_matches(".lnk").to_owned();
	std::thread::spawn(move || {
		let initialized =
			unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
		let deadline = Instant::now() + LISTING_WAIT;
		while Instant::now() < deadline {
			if listed_name(&aumid).as_deref() == Some(listed.as_str()) {
				let hwnd = HWND(hwnd as *mut std::ffi::c_void);
				let _ = readd_taskbar_button(hwnd);
				break;
			}
			std::thread::sleep(LISTING_POLL);
		}
		if initialized.is_ok() {
			unsafe { CoUninitialize() };
		}
	});
	Ok(())
}

pub(super) fn apply(
	app: &AppHandle,
	chosen: Option<&'static Preset>,
) -> Result<(), DisguiseError> {
	let look = look(app, chosen)?;
	let listed = update_installation(app, chosen, &look)?;
	let window = app.get_webview_window(crate::MAIN_WINDOW_LABEL);
	if let (true, Some(window)) = (listed, window) {
		let aumid = app.config().identifier.clone();
		if let Err(error) = refresh_taskbar_button(&window, aumid, &look.name) {
			tracing::warn!(
				"[disguise] could not refresh the taskbar button: {}",
				error.0
			);
		}
	}
	Ok(())
}

pub(super) fn reapply(
	app: &AppHandle,
	chosen: Option<&'static Preset>,
) -> Result<(), DisguiseError> {
	let mut recorded = false;
	with_key(&format!(r"{}\{SHORTCUTS_KEY}", app_key(app)), false, |_| {
		recorded = true;
		Ok(())
	})?;
	if chosen.is_none() && !recorded {
		return Ok(());
	}
	let app = app.clone();
	std::thread::spawn(move || {
		let restored = look(&app, chosen)
			.and_then(|look| update_installation(&app, chosen, &look))
			.map(|_| ());
		if let Err(error) = restored {
			tracing::warn!(
				"[disguise] could not restore the shortcuts: {}",
				error.0
			);
		}
	});
	Ok(())
}

fn load_icon(
	chosen: Option<&Preset>,
	path: Option<&Path>,
	size: i32,
) -> Option<HICON> {
	let handle = unsafe {
		match (chosen, path) {
			(Some(_), Some(path)) => LoadImageW(
				None,
				&HSTRING::from(path),
				IMAGE_ICON,
				size,
				size,
				LR_LOADFROMFILE,
			),
			_ => LoadImageW(
				GetModuleHandleW(None).ok().map(Into::into),
				PCWSTR(EXE_ICON_RESOURCE as usize as *const u16),
				IMAGE_ICON,
				size,
				size,
				IMAGE_FLAGS(LR_DEFAULTCOLOR.0),
			),
		}
	};
	handle.ok().map(|handle| HICON(handle.0))
}

pub(super) fn decorate(
	app: &AppHandle,
	window: &WebviewWindow,
	chosen: Option<&'static Preset>,
) -> Result<(), DisguiseError> {
	let path = write_icon(app, chosen)?;
	let hwnd = HWND(window.hwnd()?.0);
	for (kind, metric) in [(ICON_SMALL, SM_CXSMICON), (ICON_BIG, SM_CXICON)] {
		let size = unsafe { GetSystemMetrics(metric) };
		if let Some(icon) = load_icon(chosen, path.as_deref(), size) {
			unsafe {
				SendMessageW(
					hwnd,
					WM_SETICON,
					Some(WPARAM(kind as usize)),
					Some(LPARAM(icon.0 as isize)),
				);
			}
		}
	}
	Ok(())
}
