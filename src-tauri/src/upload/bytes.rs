use crate::api::rest::{encode_response, RawResponse};
use crate::error::AppError;
use crate::photo;
use crate::state::AppState;
use crate::upload::file::{
	open_photo, profile_of, signed_in_as, unless_session_changes, Race,
};
use crate::upload::picked::PickedFile;

const NOT_A_PHOTO: &str = "Only photos can be sent here";

#[tauri::command]
pub async fn upload_media(
	app: tauri::AppHandle,
	state: tauri::State<'_, AppState>,
	path: String,
	signed: bool,
	file: PickedFile,
) -> Result<String, AppError> {
	let client = state.client()?;
	let mut sessions = client.session_receiver();
	let Some(profile_id) = profile_of(&sessions.borrow()).map(str::to_owned)
	else {
		return Err(AppError::NotSignedIn);
	};
	let Some(bytes) = open_photo(app.clone(), file).await? else {
		return Err(AppError::Media(NOT_A_PHOTO.to_owned()));
	};
	let photo = photo::normalize(&app, bytes, photo::JPEG.to_owned()).await?;

	if !signed_in_as(&sessions.borrow(), &profile_id) {
		return Err(AppError::SessionCleared);
	}
	let request = client.request(grindr::Method::POST, &path);
	let request = if signed {
		request.signed_bytes(&photo.content_type, photo.bytes)
	} else {
		request.bytes(&photo.content_type, photo.bytes)
	};
	let raw = unless_session_changes(Race {
		sessions: &mut sessions,
		profile_id: &profile_id,
		send: request.send(),
	})
	.await?
	.map_err(|e| AppError::from_client_error(e, client))?;

	encode_response(&RawResponse {
		status: raw.status,
		body: raw.body,
	})
}
