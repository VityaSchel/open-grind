use super::*;

struct Scratch(PathBuf);

impl Scratch {
	fn new(name: &str) -> Self {
		let dir = std::env::temp_dir()
			.join(format!("og-desktop-push-{}-{name}", std::process::id()));
		let _ = fs::remove_dir_all(&dir);
		Self(dir)
	}

	fn file(&self) -> PathBuf {
		self.0.join("notification-categories.json")
	}
}

impl Drop for Scratch {
	fn drop(&mut self) {
		let _ = fs::remove_dir_all(&self.0);
	}
}

fn message(tag: &str, message_id: &str) -> Announcement {
	Announcement {
		category: Category::Messages,
		tag: tag.to_owned(),
		message_id: Some(message_id.to_owned()),
		title: "James".to_owned(),
		body: "hi".to_owned(),
		deeplink: format!("grindr://conversation?id={tag}"),
	}
}

fn enabled_categories(push: &DesktopPush) -> Vec<(String, bool)> {
	push.categories()
		.into_iter()
		.map(|category| (category.category, category.enabled))
		.collect()
}

#[test]
fn every_category_starts_enabled() {
	let scratch = Scratch::new("defaults");

	let push = DesktopPush::load(scratch.file());

	assert_eq!(
		enabled_categories(&push),
		[("messages".to_owned(), true), ("taps".to_owned(), true)]
	);
}

#[test]
fn a_turned_off_category_stays_off_after_a_restart() {
	let scratch = Scratch::new("restart");
	DesktopPush::load(scratch.file())
		.set_category(Category::Taps, false)
		.unwrap();

	let push = DesktopPush::load(scratch.file());

	assert_eq!(
		enabled_categories(&push),
		[("messages".to_owned(), true), ("taps".to_owned(), false)]
	);
}

#[test]
fn an_unreadable_categories_file_falls_back_to_every_category_on() {
	let scratch = Scratch::new("corrupt");
	fs::create_dir_all(&scratch.0).unwrap();
	fs::write(scratch.file(), b"{not json").unwrap();

	let push = DesktopPush::load(scratch.file());

	assert!(push.categories().iter().all(|category| category.enabled));
}

#[test]
fn nothing_is_announced_until_notifications_and_its_category_are_on() {
	let scratch = Scratch::new("admits");
	let push = DesktopPush::load(scratch.file());
	let announcement = message("1:2", "m1");

	assert!(!push.admits(&announcement));
	push.set_enabled(true);
	assert!(push.admits(&announcement));
	push.set_category(Category::Messages, false).unwrap();
	assert!(!push.admits(&announcement));
}

#[test]
fn unsending_withdraws_a_chat_only_while_it_shows_that_message() {
	let scratch = Scratch::new("unsend");
	let push = DesktopPush::load(scratch.file());
	push.record(&message("1:2", "m2"));

	assert!(!push.withdraw("1:2", Some("m1")));
	assert!(push.withdraw("1:2", Some("m2")));
	assert!(!push.withdraw("1:2", None));
}

#[test]
fn deleting_a_chat_withdraws_whatever_it_shows() {
	let scratch = Scratch::new("delete");
	let push = DesktopPush::load(scratch.file());
	push.record(&message("1:2", "m2"));

	assert!(push.withdraw("1:2", None));
}

#[test]
fn shown_tags_follow_what_is_recorded_and_withdrawn() {
	let scratch = Scratch::new("shown");
	let push = DesktopPush::load(scratch.file());
	push.record(&message("1:2", "m1"));

	assert_eq!(push.shown_tags(), ["1:2"]);
	push.withdraw("1:2", None);
	assert!(push.shown_tags().is_empty());
}

#[test]
fn turning_notifications_off_withdraws_everything_shown() {
	let scratch = Scratch::new("off");
	let push = DesktopPush::load(scratch.file());
	push.record(&message("1:2", "m1"));
	push.record(&message("3:4", "m2"));

	let mut withdrawn = push.set_enabled(false);
	withdrawn.sort();

	assert_eq!(withdrawn, ["1:2", "3:4"]);
	assert!(!push.withdraw("1:2", None));
}

#[test]
fn opening_a_notification_leaves_its_deeplink_for_the_app_once() {
	let scratch = Scratch::new("open");
	let push = DesktopPush::load(scratch.file());
	push.record(&message("1:2", "m1"));

	assert!(push.open("1:2", None));
	assert_eq!(
		push.take_deeplink().as_deref(),
		Some("grindr://conversation?id=1:2")
	);
	assert_eq!(push.take_deeplink(), None);
	assert!(!push.open("1:2", None));
}

#[test]
fn opening_a_notification_from_an_earlier_launch_uses_the_link_it_carries() {
	let scratch = Scratch::new("open-carried");
	let push = DesktopPush::load(scratch.file());

	assert!(push.open("1:2", Some("grindr://conversation?id=1:2".to_owned())));
	assert_eq!(
		push.take_deeplink().as_deref(),
		Some("grindr://conversation?id=1:2")
	);
}
