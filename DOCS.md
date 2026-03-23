# Grindr API specification

Last update: 2026.03.22 / v25.20.0 (147239)

Licensed under [MIT](./LICENSE). You must credit author and reference this project if you're going to use any parts of this document.

- [Grindr API specification](#grindr-api-specification)
	- [Getting started](#getting-started)
	- [Security headers](#security-headers)
		- [`L-Device-Info`](#l-device-info)
		- [`User-Agent`](#user-agent)
		- [`requireRealDeviceInfo`](#requirerealdeviceinfo)
		- [`L-Time-Zone`](#l-time-zone)
		- [`L-Locale`](#l-locale)
	- [API Authorization](#api-authorization)
	- [Authentication](#authentication)
		- [Sign in](#sign-in)
		- [Session ID](#session-id)
	- [Messaging](#messaging)
		- [Conversations](#conversations)
			- [Conversation](#conversation)
			- [List conversations](#list-conversations)
			- [Refresh specific messages](#refresh-specific-messages)
			- [Delete conversation](#delete-conversation)
			- [Pin conversation](#pin-conversation)
			- [Unpin conversation](#unpin-conversation)
			- [Mark messages as read up to messageId](#mark-messages-as-read-up-to-messageid)
			- [Mute conversation](#mute-conversation)
			- [Unmute conversation](#unmute-conversation)
			- [Get shared media in conversation](#get-shared-media-in-conversation)
			- [AI chat suggestions](#ai-chat-suggestions)
		- [Saved phrases](#saved-phrases)
			- [Get saved phrases](#get-saved-phrases)
			- [Add a saved phrase](#add-a-saved-phrase)
			- [Delete a saved phrase](#delete-a-saved-phrase)
			- [Track phrase usage frequency](#track-phrase-usage-frequency)
		- [Messages](#messages)
			- [Message](#message)
			- [Message type](#message-type)
			- [Message contents](#message-contents)
				- [`"Album"`](#album)
				- [`"ExpiringAlbum"`](#expiringalbum)
				- [`"ExpiringAlbumV2"`](#expiringalbumv2)
				- [`"AlbumContentReaction"`](#albumcontentreaction)
				- [`"AlbumContentReply"`](#albumcontentreply)
				- [`"Audio"`](#audio)
				- [`"Video"`](#video)
				- [`"PrivateVideo"`](#privatevideo)
				- [`"NonExpiringVideo"`](#nonexpiringvideo)
				- [`"Gaymoji"`](#gaymoji)
				- [`"Generative"`](#generative)
				- [`"Giphy"`](#giphy)
				- [`"Image"`](#image)
				- [`"ExpiringImage"`](#expiringimage)
				- [`"Location"`](#location)
				- [`"ProfileLink"`](#profilelink)
				- [`"ProfilePhotoReply"`](#profilephotoreply)
				- [`"Retract"`](#retract)
				- [`"Text"`](#text)
				- [`"Unknown"`](#unknown)
				- [`"VideoCall"`](#videocall)
			- [List messages in conversation](#list-messages-in-conversation)
			- [Get a single message in conversation](#get-a-single-message-in-conversation)
			- [Send a message to conversation](#send-a-message-to-conversation)
			- [Unsend a message](#unsend-a-message)
			- [Delete a message](#delete-a-message)
			- [Send typing indicator](#send-typing-indicator)
			- [React to a message](#react-to-a-message)
		- [Misc](#misc)
			- [Translate a message](#translate-a-message)
			- [OCR recognition in chat](#ocr-recognition-in-chat)
			- [Rate an AI message suggestion](#rate-an-ai-message-suggestion)
	- [Geohash](#geohash)
	- [Position ID](#position-id)

## Getting started

- API URI: `https://grindr.mobi`, should be appended to all requests below
- Query — the parameters part in URL after path (`?example=foo&bar=baz`)
- Body — JSON payload passed in request's body

## Security headers

Security headers are intended to make reverse engineering more complex and my life harder. They are arbitrary strings appended to request, formed by algorithm defined in Grindr app and they're very likely to change with each new app release to break all existing side clients.

Also it's recommended to set `Accept: application/json` header at all times except `/v3/bootstrap` (this one returns empty response if this header is present).

### `L-Device-Info`

Absense or incorrect forming of this header might lead to HTTP status 403 and Cloudflare block page.

```
<appVersion>;GLOBAL;<deviceType>;<androidVersion>;<screenResolution>;<totalRAM>;<advertisingId>
```

- `deviceType` — `1` if `Build.CPU_ABI == "x86"` (emulator), `2` otherwise (real device)
- `appVersion` — `25.20.0.147239` or similar
- `GLOBAL` — hardcoded channel/flavor
- `totalRam` — total RAM
- `screenResolution` — "heightPx x widthPx" e.g. `2400x1080`
- `totalRAM` — ActivityManager.MemoryInfo.totalMem
- `advertisingId` — Google Advertising ID, falls back to `00000000-0000-0000-0000-000000000000` if unavailable

Example: `a1b2c3d4e5f60789;GLOBAL;2;8026152960;2400x1080;550e8400-e29b-41d4-a716-446655440000`

### `User-Agent`

Absense or incorrect forming of this header might lead to HTTP status 400 and `urn:gr:err:header` API error.

```
grindr3/25.20.0.147239;147239;<subscriptionTier>;Android <osVersion>;<deviceModel>;<manufacturer>
```

- `subscriptionTier`: `Free`, `Plus`, `Xtra`, `Unlimited`, `Premium`, `Free_Plus`, `Free_Xtra`, `Free_Unlimited`, `Free_Premium`
 
Example: `grindr3/25.20.0.147239;147239;Free;Android 13;Pixel 7;Google`

### `requireRealDeviceInfo`

Send as-is in camelCase. Must be set to `true` for most endpoints.

### `L-Time-Zone`

[Time zone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) in format Country/Region. E.g. `America/New_York` or `Europe/Madrid`. Unknown whether this value is checked against your IP's ISP location.

### `L-Locale`

Should be set along with `Accept-Language` to a language. 

- Format for Accept-Language: `en-US`
- Format for L-Locale: `en_US`

Note the hyphen/underscore.

## API Authorization

Authorization header is formed from Grindr3 prefix and auth token:

```
Authorization: Grindr3 [session ID]
```

Session ID is a JWT, see [Session ID](#session-id).

## Authentication

### Sign in

Make sure you're passing all [Security headers](#security-headers) or you might stumble upon `{"code":28,"message":"ACCOUNT_BANNED","profileId":null,"type":1,"reason":null,"isBanAutomated":true,"thirdPartyUserIdToShow":null,"banSubReason":null}` — but don't fret — it's a fake error, your account isn't banned and API simply blocked your request, not account.

```
POST /v8/sessions
```

Body:

- `email` — string with email
- `password` — string with password, don't specify if using authToken
- `authToken` — string obtained from login+password flow or `null`
- `token` — FCM (push service) string or `null`
- `geohash` — [geohash](#geohash) string or `null`

Possible errors:

- ACCOUNT_BANNED — could be malformed request
- Invalid input parameters — incorrect credentials

Response:

- profileId — string with numbers, account's ID
- sessionId — JWT token (see [Session ID](#session-id))

### Session ID

JWT obtained from [authentication](#authentication) flow. Decoded JWT content:

Headers claims structure:

- `kid` — key ID
- `alg` — `"RS256"`
- `typ` — `"JWT"`

Payload claims:

- `exp` — number, unix timestamp in seconds defining token expiration date
- `profileId` — string with numbers, account's ID
- `roles` — unknown array, appears to be empty
- `features` — array of strings, e.g. `"HidePremiumStore"`, `"CreateVideoCall"`, `"VideoCallDailyFree"`
  `featureFlags` — array of strings, e.g. `"profile-insights"`, `"online-until-updates"`, `enable-account-filters-bulk-exposure`, `"a-list-v3"`, `"discover-v2"`, `"boost_purchase_fixes"`, `discover-studfinder-upsell`
  `experiments` — object with nested structure:
    - `explore-paywall-profiles` — string, e.g. `"test"`
    - `limiting_chat_credits_from_unlimited_to_5_for_xtra_users_in_explore` — string, e.g. `"treatment"`
    - `validation-aa-backend-profileid` — string, e.g. `"test"`
    - `grindr-core-day-pass` — string, e.g. `"control"`
    - `llm-age-verification-methods` — string, e.g. `"variant_b"`
    - `trans_tribe_filtering_changes` — string, e.g. `"Test"`
    - `green_dot_v2` — string, e.g. `"treatment-1"`
    - `sponsored-profiles-cascade-selection-mode` — string, e.g. `"treatment"`
    - `read-receipt-ad-reward` — string, e.g. `"variant_2"`
    - `taps-paywall` — string, e.g. `"treatment-1"`
    - `explore-insertables-v1` — string, e.g. `"treatment-insertables-below-mpu"`
    - `reduce_number_of_free_profiles_from_99_to_90` — string, e.g. `"test"`
    - `cascade-mpu-explore-studfinder-2026-03-12` — string, e.g. `"control"`
    - `reduce_number_of_results_with_age_filter_for_free_users` — string, e.g. `"test"`
    - `mpu-heuristic-algorithm-optimizations-q125` — string, e.g. `"control"`
    - `ships_in_the_night_v3` — string, e.g. `"treatment"`
    - `cascade-mpu-disable-poc-heuristic-2026-03-02` — string, e.g. `"treatment"`
    - `for-you-recsys-v1_1` — string, e.g. `"control"`
    - `cascade-mpu-studfinder-profile-limit-2026-03-12` — string, e.g. `"treatment"`
    - `reduce_free_user_results_with_any_filter` — string, e.g. `"control"`
    - `cascade-mpu-studfinder-unlimited-2026-02-02` — string, e.g. `"treatment"`
    - `mpu-rest-of-world` — string, e.g. `"treatment"`
    - `top_18_mpu_profiles_are_online_in_extended_cascade_and_explore` — string, e.g. `"control"`
    - `for-you-v2` — string, e.g. `"Test"`
    - `rewarded-ads-viewed-me-v2` — string, e.g. `"variant_1"`
    - `mega-boost-v1` — string, e.g. `"mega-boost-low"`
  - `systemTime` — unix timestamp in milliseconds
  - `upsells` — unknown object, appears to be empty
  - `restrictionReason` — unknown value, appears to be `null`
  - `grit` — unknown UUIDv4 string

## Messaging

### Conversations

#### Conversation

- `type` — string, e.g. `"full_conversation_v1"`
- `data` — nested object
	- `conversationId` — string with numbers separated by `:`, e.g. `"12345678:23456789"`
	- `name` — string, profile name, may be an empty string, e.g. `""`
	- `participants` — array of objects
		- `profileId` — integer
		- `primaryMediaHash` — unknown, appears to be `null`
		- `lastOnline` — unix timestamp in milliseconds
		- `onlineUntil` — unix timestamp in milliseconds or `null`
		- `distanceMetres` — float number or `null`
		- `position` — [Position ID](#position-id) or `null`
		- `isInAList` — boolean
		- `hasDatingPotential` — boolean
	- `lastActivityTimestamp` — unix timestamp in milliseconds
	- `unreadCount` — integer
	- `preview` — nested object
		- `conversationId` — nested object
    		- `value` — number in string, separated by `:`
		- `messageId` — string, see [Message](#message) for format
		- `chat1MessageId` — string with UUIDv4
		- `senderId` — integer
		- `type` — string, e.g. `"Text"`
		- `chat1Type` — string, e.g. `"text"`
		- `text` — string, message text
		- `url` — unknown, appears to be `null`
		- `lat` — unknown, appears to be `null`
		- `lon` — unknown, appears to be `null`
		- `albumId` — unknown, appears to be `null`
		- `albumContentId` — unknown, appears to be `null`
		- `albumContentReply` — unknown, appears to be `null`
		- `duration` — unknown, appears to be `null`
		- `imageHash` — unknown, appears to be `null`
		- `photoContentReply` — unknown, appears to be `null`
	- `muted` — boolean
	- `pinned` — boolean
	- `favorite` — boolean
	- `context` — unknown, appears to be `null`
	- `onlineUntil` — unknown, appears to be `null`
	- `translatable` — boolean
	- `rightNow` — string, e.g. `"NOT_ACTIVE"`
	- `hasUnreadThrob` — boolean

#### List conversations

Requires [Authorization](#api-authorization).

```
POST /v4/inbox
```

*Also `POST /v3/inbox`, seems to be aliased to v4 now*

Query (optional):

- `page` — 1-based number, pagination

Body (optional):

- `unreadOnly` — boolean
- `chemistryOnly` — boolean
- `favoritesOnly` — boolean
- `rightNowOnly` — boolean
- `onlineNowOnly` — boolean
- `distanceMeters` — "double" number value or `null`
- `positions` — array of integers, [position IDs](#position-id)

Response:

- `entries` — array of [Conversation](#conversation)
- `showsFreeHeaderLabel` — boolean
- `totalFullConversations` — number, e.g. `"5"`
- `totalPartialConversations` — number, e.g. `0`
- `maxDisplayLockCount` — number, e.g. `99`
- `nextPage` — integer, e.g. `2`

#### Refresh specific messages

WIP

```
POST /v4/chat/conversation/{conversationId}/message-by-id
```

#### Delete conversation

WIP

```
DELETE /v4/chat/conversation/{conversationId}
```

#### Pin conversation

WIP

```
POST /v4/chat/conversation/{conversationId}/pin
```

#### Unpin conversation

WIP

```
POST /v4/chat/conversation/{conversationId}/unpin
```

#### Mark messages as read up to messageId

WIP

```
POST /v4/chat/conversation/{conversationId}/read/{messageId}
```

#### Mute conversation

WIP

```
POST /v1/push/conversation/{conversationId}/mute
```

#### Unmute conversation

WIP

```
POST /v1/push/conversation/{conversationId}/unmute
```

#### Get shared media in conversation

WIP

```
GET /v5/chat/media/shared/images/with-me/{conversationId}
```

#### AI chat suggestions

WIP

```
GET /v1/chat/suggestions?conversationId=
```

### Saved phrases

#### Get saved phrases

WIP

```
GET /v1/chat/phrases
```

#### Add a saved phrase

WIP

```
POST /v1/chat/phrases
```

*Also `POST /v3/me/prefs/phrases`*

#### Delete a saved phrase

WIP

```
DELETE /v3/me/prefs/phrases/{id}
```

#### Track phrase usage frequency

WIP

```
POST /v4/phrases/frequency/{id}
```

### Messages

#### Message

- `messageId` — string, appears to be a unix timestamp in milliseconds and UUIDv4 separated by `:`, e.g. `"1774296692000:843daee8-1e93-47d6-bc7f-3d981925a393"`
- `conversationId` — string, see [Conversation](#conversation)
- `senderId` — number
- `timestamp` — unix timestamp in milliseconds, appears to be same as in `messageId`
- `unsent` — boolean
- `reactions` — array, unknown contents
- `type` — string, see [Message type](#message-type)
- `body` — object with [Message contents](#message-contents)
- `replyToMessage` — unknown or `null`
- `dynamic` — boolean
- `chat1Type` — String, e.g. `"text"`
- `replyPreview` — unknown or `null`

#### Message type

- `"Album"`
- `"AlbumContentReaction"`
- `"AlbumContentReply"`
- `"Audio"`
- `"ExpiringAlbum"`
- `"ExpiringAlbumV2"`
- `"ExpiringImage"`
- `"Video"`
- `"Gaymoji"`
- `"Generative"`
- `"Giphy"`
- `"Image"`
- `"Location"`
- `"PrivateVideo"`
- `"ProfileLink"`
- `"ProfilePhotoReply"`
- `"Retract"`
- `"Text"`
- `"Unknown"`
- `"NonExpiringVideo"`
- `"VideoCall"`

#### Message contents

Payload in [`body`](#message) based on [message's `type`](#message-type)

##### `"Album"`

- `albumId` — number
- `ownerProfileId` — number or `null`
- `coverUrl` —  string or `null`
- `previewUrl` —  string or `null`
- `hasPhoto` — boolean
- `hasVideo` — boolean
- `isViewable` — boolean
- `albumNumber` — integer or `null`
- `totalAlbumsShared` — integer or `null`
- `hasUnseenContent` — boolean
- `expiresAt` — number or `null`
- `viewableUntil` — number or `null`
- `expirationType` —  string or `null`
- 
##### `"ExpiringAlbum"`

WIP

##### `"ExpiringAlbumV2"`

WIP

##### `"AlbumContentReaction"`

WIP

##### `"AlbumContentReply"`

WIP

##### `"Audio"`

- `mediaId` — number
- `url` — string
- `fileCacheKey` — string
- `mimeType` — string
- `length` — number or null
- `duration` — number or null
- `expiresAt` — number

##### `"Video"`

- `mediaId` — number or `null`
- `url` — string or `null`
- `fileCacheKey` — string
- `contentType` — string or `null`
- `length` — number
- `maxViews` — integer or `null`
- `looping` — boolean or `null`

Additionally, for expiring videos:

- `viewsRemaining` —

##### `"PrivateVideo"`

All from [Video](#video), additionally:

- `viewCount` — integer

##### `"NonExpiringVideo"`

Unknown, WIP

##### `"Gaymoji"`

- `imageHash` — string

##### `"Generative"`

Unknown, WIP

##### `"Giphy"`

- `id` — string
- `urlPath` — string
- `stillPath` — string
- `previewPath` — string
- `width` — integer
- `height` — integer
- `imageHash` — string

##### `"Image"`

- `mediaId` — number
- `url` — string
- `width` — integer or `null`
- `height` — integer or `null`
- `imageHash` — string
- `duration` — number or `null`

Additionally, only for regular images:

- `mimeType` — string
- `takenOnGrindr` — boolean or `null`
- `createdAt` — number or `null`
- `imageType` — string
- `tapType` — integer or `null`

##### `"ExpiringImage"`

All from [image](#image), additionally:

- `viewsRemaining` — number or `null`

##### `"Location"`

- `lat` — number
- `lon` — number

##### `"ProfileLink"`

Unknown, WIP

##### `"ProfilePhotoReply"`

- `imageHash` — string
- `photoContentReply` — string

##### `"Retract"`

- `targetMessageId` — string

##### `"Text"`

- `text` — string

##### `"Unknown"`

Empty type

##### `"VideoCall"`

Only for "status" messages:

- `result` — string or `null`
- `videoCallDuration` — number or `null`


#### List messages in conversation

Requires [Authorization](#api-authorization).

```
GET /v5/chat/conversation/{conversationId}/message
```

Query (optional):

- `pageKey` — optional, unknown string
- `profile` — optional, unknown boolean

Response:

- `lastReadTimestamp` — unix timestamp in milliseconds
- `messages` — array of [Message](#message)
- `metadata` — nested object
  - `translate` — boolean
  - `hasSharedAlbums` — boolean
  - `isInAList` — boolean
- `profile` — unknown value, appears to be null

#### Get a single message in conversation

Requires [Authorization](#api-authorization).

```
GET /v4/chat/conversation/{conversationId}/message/{messageId}
```

Response:

- `message` — [Message](#message)

#### Send a message to conversation

Please don't use this for spam. Be civil.

Requires [Authorization](#api-authorization).

```
POST /v4/chat/message/send
```

Body:

- `type` — string, see [Message type](#message-type)
- `target` — nested object
  - `type` — `Direct`, `Group`, `HumanWingman`
  - `targetId` — integer
- `body` — object with [Message contents](#message-contents) or `null`
- `ref` — string or `null`
- `replyToMessageId` — string or `null`

Response:

#### Unsend a message

WIP

```
POST /v4/chat/message/unsend
```

#### Delete a message

WIP

```
POST /v4/chat/message/delete
```

#### Send typing indicator

WIP

```
POST /v4/chatstatus/typing
```

#### React to a message

WIP

```
POST /v4/chat/message/reaction
```

### Misc

#### Translate a message

WIP

```
POST /v5/chat/translate
```

#### OCR recognition in chat

WIP

```
POST /v5/recognition/chat
```

#### Rate an AI message suggestion

WIP

```
POST /v1/wingman/feedback
```

## Geohash

https://en.wikipedia.org/wiki/Geohash

WIP

## Position ID

- 1 — "Top"
- 2 — "Bottom"
- 3 — "Versatile"
- 4 — "Vers Bottom"
- 5 — "Vers Top"
- 6 — "Side"