use std::fmt::Display;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{AppHandle, Manager, Runtime};

use crate::error::AppError;
use crate::photo::encode::MAX_EDGE;
use crate::photo::source::{self, Format, Source};

struct Decoder<R: Runtime> {
	handle: PluginHandle<R>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DecodeRequest {
	data: String,
	max_edge: u32,
}

#[derive(Deserialize)]
struct DecodeResponse {
	data: String,
}

pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
	Builder::new("photo")
		.setup(|app, api| {
			let handle = api.register_android_plugin(
				"org.opengrind.photo",
				"PhotoPlugin",
			)?;
			app.manage(Decoder { handle });
			Ok(())
		})
		.build()
}

pub async fn decode<R: Runtime>(
	app: &AppHandle<R>,
	bytes: Vec<u8>,
) -> Result<Source, AppError> {
	let handle = app.state::<Decoder<R>>().handle.clone();
	let request = DecodeRequest {
		data: STANDARD.encode(&bytes),
		max_edge: MAX_EDGE,
	};
	let response: DecodeResponse = handle
		.run_mobile_plugin_async("decodeToPng", request)
		.await
		.map_err(undecodable)?;
	let png = STANDARD.decode(response.data).map_err(undecodable)?;

	crate::photo::off_thread(move || source::decode(Format::Png, &png))
		.await?
		.ok_or_else(|| AppError::Media(super::UNSUPPORTED.to_owned()))
}

fn undecodable(error: impl Display) -> AppError {
	AppError::Media(format!("Undecodable photo: {error}"))
}
