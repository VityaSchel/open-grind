//! Drops browser-shell entries from the WebView2 context menu. No-op off Windows.

/// WebView2 names an item after its English label in lower camel case:
/// <https://learn.microsoft.com/microsoft-edge/webview2/reference/win32/icorewebview2contextmenuitem>
#[cfg(target_os = "windows")]
const REMOVED: [&str; 3] = ["print", "saveAs", "sendTabToSelf"];

pub fn trim_native_menu<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
	#[cfg(target_os = "windows")]
	{
		let dispatched = window.with_webview(|webview| {
			if let Err(e) = windows::install(&webview) {
				tracing::warn!("[context-menu] left untrimmed: {e}");
			}
		});
		if let Err(e) = dispatched {
			tracing::warn!("[context-menu] could not reach the webview: {e}");
		}
	}

	#[cfg(not(target_os = "windows"))]
	let _ = window;
}

#[cfg(target_os = "windows")]
mod windows {
	use webview2_com::ContextMenuRequestedEventHandler;
	use webview2_com::Microsoft::Web::WebView2::Win32::{
		ICoreWebView2ContextMenuItemCollection, ICoreWebView2_11,
	};
	use windows::Win32::System::Com::CoTaskMemFree;
	use windows_core::{Interface, PWSTR};

	use super::REMOVED;

	pub fn install(
		webview: &tauri::webview::PlatformWebview,
	) -> windows_core::Result<()> {
		// ContextMenuRequested arrived in ICoreWebView2_11; Microsoft's own
		// sample queries ICoreWebView2_4, which does not declare it.
		let core: ICoreWebView2_11 =
			unsafe { webview.controller().CoreWebView2()? }.cast()?;
		let mut token = 0i64;
		unsafe {
			core.add_ContextMenuRequested(
				&ContextMenuRequestedEventHandler::create(Box::new(
					|_, args| match args {
						Some(args) => trim(&args.MenuItems()?),
						None => Ok(()),
					},
				)),
				&mut token,
			)
		}
	}

	/// Back to front, so removing one does not renumber the rest.
	fn trim(
		items: &ICoreWebView2ContextMenuItemCollection,
	) -> windows_core::Result<()> {
		let mut count = 0u32;
		unsafe { items.Count(&mut count)? };
		for index in (0..count).rev() {
			if REMOVED.contains(&name_at(items, index)?.as_str()) {
				unsafe { items.RemoveValueAtIndex(index)? };
			}
		}
		Ok(())
	}

	fn name_at(
		items: &ICoreWebView2ContextMenuItemCollection,
		index: u32,
	) -> windows_core::Result<String> {
		let item = unsafe { items.GetValueAtIndex(index)? };
		let mut raw = PWSTR::null();
		unsafe { item.Name(&mut raw)? };
		if raw.is_null() {
			return Ok(String::new());
		}
		let name = unsafe { raw.to_string() }.unwrap_or_default();
		unsafe { CoTaskMemFree(Some(raw.as_ptr().cast())) };
		Ok(name)
	}
}
