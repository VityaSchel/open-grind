# Push Notifications

Grindr delivers background notifications through Firebase Cloud Messaging as **data-only** messages: the payload is a flat map of strings, and the client decides what to render. Nothing arrives pre-rendered, so every field below is the client's responsibility.

While the app is in the foreground the same events also arrive over the [WebSocket](/grindr-api/websocket/) as [notification events](/grindr-api/websocket/notification-event); push is the out-of-process path for when it is not.

Register a token with [Register push token](/grindr-api/settings/account#register-push-token) and stop delivery with [Unregister push token](/grindr-api/settings/account#unregister-push-token).

## Envelope

`version` selects the payload shape. Anything that is not exactly `"2"` — including a missing key — is the legacy V1 shape.

## Version 2

Every value is a string.

- `version` — `"2"`
- `notificationId` — UUIDv4, the dedupe key
- `title` — display text, or a [text key](#text-keys) when `translateTitle` is `"true"`
- `titleArgs` — JSON array of format arguments for a translated title
- `translateTitle` — `title` is a key when this parses as true; `Boolean.parseBoolean` ignores case, so `"TRUE"` counts and every other value is false
- `body` — display text, or a [text key](#text-keys) when `translateBody` is `"true"`
- `bodyArgs` — JSON array of format arguments for a translated body
- `translateBody` — as `translateTitle`
- `action` — [deeplink](#actions); must start with `grindr://`
- `channel` — [channel](#channels) the notification belongs to
- `imageUrl` — absolute CDN URL for the sender's avatar, or absent
- `senderId` — profile ID of the sender, as a string
- `timestamp` — unix timestamp in milliseconds
- `quickReply` — `"true"` when the notification may offer an inline reply

A payload with no `body`, an unknown `channel`, or an `action` outside the `grindr://` scheme is dropped by the official client rather than rendered.

## Text keys

When the matching `translate*` flag is `"true"`, the field holds a key rather than text. Keys relevant to chats and taps:

- `SOMEONE_TITLE` — Someone
- `TAP_NOTIFICATION_BODY` — Tapped you
- `CHAT_IMAGE_NOTIFICATION_BODY` — Sent you a picture
- `CHAT_VIDEO_NOTIFICATION_BODY` — Sent you a video
- `CHAT_AUDIO_NOTIFICATION_BODY` — Sent you an audio message
- `CHAT_GIF_NOTIFICATION_BODY` — Sent you a GIF
- `CHAT_GAYMOJI_NOTIFICATION_BODY` — Sent you a Gaymoji
- `CHAT_LOCATION_NOTIFICATION_BODY` — Sent you their location
- `CHAT_EXPIRING_IMAGE_NOTIFICATION_BODY` — Sent you an expiring image
- `CHAT_ALBUM_NOTIFICATION_BODY` — Shared their album
- `CHAT_ALBUM_CONTENT_REACTION_NOTIFICATION_BODY` — Liked your album content

Other key families exist for A-List updates, Boost, album updates, Right Now, Discover and subscription offers.

A direct text message carries its text **in plaintext** with `translateBody` set to `"false"`; only media and system messages use a key.

## Actions

- `grindr://conversation?id=<conversationId>&senderId=<profileId>` — open a conversation; both parameters are required
- `grindr://taps-inbox` — taps
- `grindr://viewed-me` — viewed me
- `grindr://right-now-inbox` — Right Now inbox
- `grindr://fresh-albums?albumIds=<id,…>&albumProfileId=<profileId>` — album updates
- `grindr://boost?action=<action>&source=<source>` — Boost results
- `grindr://favorite-profile?profileID=<profileId>` — a favorite came online; the parameter is also spelled `profileId`

Two actions are **cancel-only** and must never be rendered:

- `grindr://clear?profileIds=<id,…>` — withdraw every notification whose `senderId` is listed, e.g. once the conversation was read elsewhere
- `grindr://unsend?notificationId=<id>` — withdraw one notification, e.g. after the sender unsent the message

## Channels

`channel` names an Android notification channel. A payload naming any other channel is dropped.

- `id_grindr_notifications_channel_individual_v2` — chats
- `id_grindr_notifications_channel_tap_v2` — taps
- `id_grindr_notifications_channel_alist` — A-List
- `id_grindr_notifications_channel_boost` — Boost
- `id_grindr_notifications_channel_fresh_albums` — album updates
- `id_grindr_notifications_channel_promotions` — promotions
- `id_grindr_notifications_channel_subscriptions` — subscriptions
- `id_grindr_notifications_channel_video_chat` — video calls
- `event_calendar_channel_id` — event calendar

## Dedupe and grouping

- Two payloads sharing a `notificationId` replace each other; the official client posts with the channel as the tag and `notificationId.hashCode()` as the id
- Conversation notifications are grouped by the `id` of the conversation deeplink
- There is no server-side dedupe: the same message can be delivered more than once, so dedupe on `notificationId`

## Campaign markers

- `pinpoint.campaign.campaign_id` is present on **ordinary messages too**, carrying the sentinel `_DIRECT`. Only a value other than `_DIRECT` marks a campaign — treating the key's presence as "marketing" discards every real message (observed 2026-09-17)
- `campaignId` behaves the same way
- `_ab` marks a Braze push, which the official client hands to the Braze SDK and never renders itself
- `af-uinstall-tracking` marks an AppsFlyer uninstall probe, which is discarded

## Version 1

The legacy shape dispatches on `notificationType` instead of an action:

- `chat-platform` — direct message; `message` holds the full [Message](/grindr-api/messaging/messages#message) JSON, `senderDisplayName` and `senderProfileImageMediaHash` sit alongside it
- `offline-tap-sent-event-v1`, `offline-tap-sent-event-v2` — `tap` holds the tap JSON
- `fresh-albums` — `payload` holds an album-update object shaped like a V2 payload
- `PUSH_EVENT` — `pushEvent` holds `{type, title, body, silent, data}`, used for Boost session ends, banned-profile cleanup and trial reminders
- `chat` — legacy, no longer rendered

## Acknowledging

[Acknowledge notifications](/grindr-api/system/notifications) reports a notification as seen with `source` `PUSH`, or `WEBSOCKET` when the same notification arrived over the socket instead.

## Polling instead of push

A client without FCM can rebuild chat and tap notifications from two REST calls:

- [Get conversations](/grindr-api/messaging/conversations#get-conversations), `POST /v4/inbox?page=<n>` — the next page exists while the response carries `nextPage`. Each `entries[].data` carries `conversationId`, `name`, `lastActivityTimestamp`, `unreadCount`, `muted`, `participants[].profileId` and a `preview` of the last message with `messageId`, `senderId`, `type` and `text`
- [Get received taps](/grindr-api/interest/taps#get-received-taps), `GET /v2/taps/received` — each `profiles[]` entry carries `profileId`, `displayName` and `timestamp`

`profileId` and `senderId` can arrive as a number or a numeric string. The peer of a conversation is the first participant that isn't the signed-in profile.

`preview` holds only the last message, so several messages sent between two calls show up as one. When `preview.senderId` is the signed-in profile, the last message is the user's own and the unread messages are older than the preview; their content isn't in the response.

`unreadCount` 0 is the only sign that a conversation was read elsewhere. The inbox has no unsend signal.

Each case maps to a V2 payload:

- An unread conversation — `action` `grindr://conversation?id=<conversationId>&senderId=<peer>`, `title` `name`, `body` `preview.text`. A preview without text maps to the `CHAT_*_NOTIFICATION_BODY` [text key](#text-keys) for its `preview.type`, e.g. `Image` to `CHAT_IMAGE_NOTIFICATION_BODY` and `Giphy` to `CHAT_GIF_NOTIFICATION_BODY`
- A conversation read elsewhere — Grindr has no chat-scoped withdrawal: `grindr://clear?profileIds=<peer>` also withdraws that profile's tap notifications. Open Grind's poll emits its own `grindr://clear?conversationId=<conversationId>` instead, which the official client does not understand
- A received tap — `action` `grindr://taps-inbox`, `title` `displayName`, `body` `TAP_NOTIFICATION_BODY`
