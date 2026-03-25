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
			- [Saved phrase](#saved-phrase)
			- [Get saved phrases](#get-saved-phrases)
			- [Add a saved phrase](#add-a-saved-phrase)
			- [Get saved phrases (legacy)](#get-saved-phrases-legacy)
			- [Add a saved phrase (legacy)](#add-a-saved-phrase-legacy)
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
	- [Users](#users)
		- [Profiles](#profiles)
			- [Profile](#profile)
			- [Get profile by ID](#get-profile-by-id)
			- [Get multiple profiles by ID](#get-multiple-profiles-by-id)
			- [Update own profile (full)](#update-own-profile-full)
			- [Update own profile (partial)](#update-own-profile-partial)
			- [Delete own profile](#delete-own-profile)
			- [Delete profile photos](#delete-profile-photos)
			- [Check if profiles are reachable](#check-if-profiles-are-reachable)
		- [Favorites](#favorites)
			- [Add favorite](#add-favorite)
			- [Remove favorite](#remove-favorite)
			- [Get all notes](#get-all-notes)
			- [Get note](#get-note)
			- [Add note](#add-note)
			- [Delete note](#delete-note)
		- [Location](#location-1)
			- [Geohash](#geohash)
			- [Search places by name](#search-places-by-name)
			- [Update location](#update-location)
		- [Interest](#interest)
			- [ViewSourceEnum](#viewsourceenum)
			- [Record profile views (batch)](#record-profile-views-batch)
			- [Record single profile view](#record-single-profile-view)
			- [Record profile view v2](#record-profile-view-v2)
			- [Get sent taps](#get-sent-taps)
			- [Send a tap](#send-a-tap)
			- [Get received taps](#get-received-taps)
			- [Get views number](#get-views-number)
			- [Get viewers list](#get-viewers-list)
		- [Managed fields](#managed-fields)
			- [Pronouns](#pronouns)
			- [Genders](#genders)
			- [Suggest gender or pronoun](#suggest-gender-or-pronoun)
		- [Hardcoded fields](#hardcoded-fields)
			- [Profile tags](#profile-tags)
			- [Position ID](#position-id)
			- [Ethnicity](#ethnicity)
			- [Relationship status](#relationship-status)
			- [Body type](#body-type)
			- [HIV status](#hiv-status)
			- [Accept NSFW pics](#accept-nsfw-pics)
			- [Meet at](#meet-at)
			- [Sexual health](#sexual-health)
			- [Looking for](#looking-for)
			- [Tribes](#tribes)
			- [Vaccines](#vaccines)
	- [Right Now](#right-now)
		- [RightNowStatusEnum](#rightnowstatusenum)
	- [Rate limits](#rate-limits)

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

Session ID is a JWT, see [Session ID](#session-id). Session IDs are short-lived (exactly 30 minutes) and non-extendable (expiration duration is fixed). However, issuing subsequent requests to [Sign in endpoint](#sign-in) with any of `authToken`s (regardless of whether they're expired or not) allows you to generate more Session IDs. Previous Session ID JWT tokens aren't revoked, meaning you can request a new Session ID any time you need to make a request, but to avoid hitting [rate limits](#rate-limits), consider caching them until a token either expires or becomes non valid for any other reason.

## Authentication

### Sign in

Make sure you're passing all [Security headers](#security-headers) or you might stumble upon `{"code":28,"message":"ACCOUNT_BANNED","profileId":null,"type":1,"reason":null,"isBanAutomated":true,"thirdPartyUserIdToShow":null,"banSubReason":null}` — but don't fret — it's a fake error, your account isn't banned and API simply blocked your request, not account.

```
POST /v8/sessions
```

Body:

- `email` — string with email
- `password` — string with password, don't specify if using `authToken`
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

Requires [Authorization](#api-authorization).

```
POST /v4/chat/conversation/{conversationId}/message-by-id
```

#### Delete conversation

Requires [Authorization](#api-authorization).

Deletes the conversation on your side. Does not delete the conversation for other chat's participant.

Repeated requests are completed without errors.

```
DELETE /v4/chat/conversation/{conversationId}
```

Response:

Empty.

#### Pin conversation

Requires [Authorization](#api-authorization).

Affects sorting position in [list conversations](#list-conversations) endpoint response.

Repeated requests are completed without errors. Requests on non existing conversations seem to be affecting them after they have been created.

```
POST /v4/chat/conversation/{conversationId}/pin
```

No body.

Response:

Empty.

#### Unpin conversation

Requires [Authorization](#api-authorization).

Affects sorting position in [list conversations](#list-conversations) endpoint response. Requests on non existing conversations seem to be affecting them after they have been created.

Repeated requests are completed without errors.

```
POST /v4/chat/conversation/{conversationId}/unpin
```

No body.

Response:

Empty.

#### Mark messages as read up to messageId

WIP

Requires [Authorization](#api-authorization).

```
POST /v4/chat/conversation/{conversationId}/read/{messageId}
```

No body.

#### Mute conversation

Requires [Authorization](#api-authorization).

Requests on non existing conversations seem to be affecting them after they have been created.

Repeated requests are completed without errors.


```
POST /v1/push/conversation/{conversationId}/mute
```

No body.

Response:

Empty

#### Unmute conversation

Requires [Authorization](#api-authorization).

Requests on non existing conversations seem to be affecting them after they have been created.

Repeated requests are completed without errors.

```
POST /v1/push/conversation/{conversationId}/unmute
```

No body.

Response:

Empty

#### Get shared media in conversation

WIP

Requires [Authorization](#api-authorization).

```
GET /v5/chat/media/shared/images/with-me/{conversationId}
```

#### AI chat suggestions

WIP

Requires [Authorization](#api-authorization).

```
GET /v1/chat/suggestions?conversationId=
```

### Saved phrases

#### Saved phrase

- `id` — string
- `text` — string
- `type` — string, e.g. `"user"`

#### Get saved phrases

Requires [Authorization](#api-authorization).

```
GET /v1/chat/phrases
```

Response:

- `phrases` — array of [Saved phrases](#saved-phrase)

#### Add a saved phrase

Requires [Authorization](#api-authorization).

```
POST /v1/chat/phrases
```

Body:

- `text` — string

Response:

- `phrase` — [Saved phrase](#saved-phrase)

#### Get saved phrases (legacy)

Requires [Authorization](#api-authorization).

```
GET /v3/me/prefs
```

Response:

- `phrases` — object
  - key is phrase ID (uuid)
    - `phraseId` — string, uuid
    - `phraseText` — string
    - `timestamp` — unix timestamp in milliseconds
    - `frequency` — integer, see [Track phrase usage frequency](#track-phrase-usage-frequency)

#### Add a saved phrase (legacy)

Requires [Authorization](#api-authorization).

This endpoint is somewhat broken and sometimes throws 500 ISE error or .

```
POST /v3/me/prefs/phrases
```

Body:

- `phrase` — string

Response:

- `phrase` — [Saved phrase](#saved-phrase)

#### Delete a saved phrase

Requires [Authorization](#api-authorization).

```
DELETE /v3/me/prefs/phrases/{id}
```

Response:

Empty.

#### Track phrase usage frequency

Requires [Authorization](#api-authorization).

Doesn't appear to influence the phrase's sorting position in [Get saved phrases](#get-saved-phrases) response. Increments value in [Get saved phrases (legacy)](#get-saved-phrases-legacy) endpoint.

```
POST /v4/phrases/frequency/{id}
```

No body.

Response:

Empty

### Messages

#### Message

- `messageId` — string, appears to be a unix timestamp in milliseconds and UUIDv4 separated by `:`, e.g. `"1774296692000:843daee8-1e93-47d6-bc7f-3d981925a393"`
- `conversationId` — string, see [Conversation](#conversation)
- `senderId` — number
- `timestamp` — unix timestamp in milliseconds, appears to be same as in `messageId`
- `unsent` — boolean, if this is true, `body` is set to `null`
- `reactions` — array of objects:
  - `profileId` — integer
  - `reactionType` — integer (`1` is "🔥")
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

Might have `"body": null` for [unsent](#unsend-a-message) messages

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

WIP

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

Unknown body parameters:

- `ref` — string or `null`, optional
- `replyToMessageId` — string or `null`, optional, WIP

Response:

[Message](#message) object.

#### Unsend a message

Requires [Authorization](#api-authorization).

Turns a message in chat into "This message was unsent."

Repeated requests are completed without errors.

```
POST /v4/chat/message/unsend
```

Body:

- `conversationId` — string
- `messageId` — string, must be sent by you

Response:

Empty.

Errors:

- 500 Internal Error if conversation or message was not found or if it wasn't sent by you

#### Delete a message

Requires [Authorization](#api-authorization).

Deletes a message on your side. Does not delete message for other chat participant.

Repeated requests are completed without errors.

```
POST /v4/chat/message/delete
```

Body:

- `conversationId` — string
- `messageId` — string

Response:

Empty.

Errors:

- 500 Internal Error if conversation or message was not found

#### Send typing indicator

Requires [Authorization](#api-authorization).

```
POST /v4/chatstatus/typing
```

Body:

- `conversationId` — string
- `status` — either `"Typing"` or `"Cleared"`

Response:

Empty.

Errors:

- 403 Action not permitted if conversation not found

#### React to a message

Requires [Authorization](#api-authorization).

There is no discovered way to undo the reaction as of yet.

Repeated requests are completed without errors.

```
POST /v4/chat/message/reaction
```

Body:

- `conversationId` — string
- `messageId` — string
- `reactionType` — integer, (`1` is "🔥")

Response:

Empty.

Errors:

- 500 Internal Error if conversation or message was not found

### Misc

#### Translate a message

Requires [Authorization](#api-authorization).

Paid feature.

```
POST /v5/chat/translate
```

Body:

- `conversationId` — string
- `messageId` — string
- `targetLanguageCode` — string, e.g. `en`

Response:

- `translatedText` — string

Errors:

- HTTP status 402, error `User has reached their entitlement limits`

#### OCR recognition in chat

WIP

Requires [Authorization](#api-authorization).

Appears to be a submitting endpoint rather than a retrieving one.

```
POST /v5/recognition/chat
```

#### Rate an AI message suggestion

WIP

Requires [Authorization](#api-authorization).

```
POST /v1/wingman/feedback
```

Body:

- `message_id` — string
- `prompt_id` — string
- `rating` — number, e.g. `1`
- `text` — string, feedback text
- `timestamp` — unix timestamp in milliseconds

Response:

Empty object (`{}`).

Errors:

- HTTP status 400 (bad request)

## Users

### Profiles

#### Profile

- `profileId` — string with numeric id
- `displayName` — string or `null`
- `aboutMe` — string or `null`
- `age` — number or `null`
- `showAge` — boolean
- `ethnicity` — integer or `null`, see [Ethnicity](#ethnicity)
- `relationshipStatus` — integer or `null`, see [Relationship status](#relationship-status)
- `grindrTribes` — array of integers, see [Tribes](#tribes)
- `lookingFor` — array of integers, see [Looking for](#looking-for)
- `vaccines` — array of integers, see [Vaccines](#vaccines)
- `bodyType` — number or `null`, see [Body type](#body-type)
- `sexualPosition` — integer or `null`, see [Position ID](#position-id)
- `hivStatus` — number or `null`, see [HIV status](#hiv-status)
- `lastTestedDate` — unix timestamp in milliseconds or `null`
- `height` — number or `null`
- `weight` — number or `null`
- `socialNetworks` — object
  - `twitter` — object, may be absent
    - `userId` — string or `null`
  - `facebook` — object, may be absent
    - `userId` — string or `null`
  - `instagram` — object, may be absent
    - `userId` — string or `null`
- `showDistance` — boolean
- `approximateDistance` — boolean
- `seen` — unix timestamp in milliseconds or `null`
- `onlineUntil` — long number or `null`
- `distance` — number or `null`
- `isFavorite` — boolean
- `profileImageMediaHash` — string or `null`
- `identity` — identity (unknown, wip) or `null`
- `medias` — array of profile photos objects
  - `mediaHash` — string
  - `type` — integer
  - `state` — integer
  - `reason` — string or `null`
  - `takenOnGrindr` — boolean or `null`
  - `createdAt` — long number or `null`
- `lastChatTimestamp` — number
- `isNew` — boolean
- `lastViewed` — number or `null`
- `meetAt` — array of integers, see [Meet at](#meet-at)
- `nsfw` — integer or `null`, see [Accept NSFW pics](#accept-nsfw-pics)
- `hashtags` — unknown array
- `profileTags` — array of strings, see [Profile tags](#profile-tags)
- `lastUpdatedTime` — unix timestamp in milliseconds
- `genders` — array of integers, see [Genders](#genders)
- `pronouns` — array of integers, see [Pronouns](#pronouns)
- `tapped` — boolean
- `tapType` — boolean
- `lastReceivedTapTimestamp` — number or `null`
- `isTeleporting` — boolean
- `isRoaming` — boolean
- `arrivalDays` — number or `null`
- `foundVia` — [ViewSourceEnum](#viewsourceenum) or `null`
- `unreadCount` — number, may be absent
- `rightNow` — [RightNowStatusEnum](#rightnowstatusenum)
- `rightNowText` — string or `null`
- `rightNowPosted` — long number or `null`
- `rightNowDistance` — long number or `null`
- `rightNowThumbnailUrl` — string or `null`
- `rightNowFullImageUrl` — string or `null`
- `rightNowShareLocation` — `null`
- `rightNowMedias` — array of objects
  - `mediaId` — long number or `null`
  - `thumbnailUrl` — string
  - `fullImageUrl` — string
  - `contentType` — string
  - `isNsfw` — boolean or `null`
- `verifiedInstagramId` — string or `null`
- `lastThrobTimestamp` — unknown
- `isBlockable` — boolean
- `sexualHealth` — array of integers, see [Sexual health](#sexual-health)
- `isVisiting` — boolean
- `travelPlans` — array of objects
  - `endDateUtc` — long or `null`
  - `geohash` — string
  - `id` — long number or `null`
  - `locationName` — string
  - `showOnProfile` — boolean or `null`
  - `startDateUtc` — long number or `null`
- `isInAList` — boolean
- `showTribes` — boolean
- `showPosition` — boolean
- `tribesImInto` — null
- `showVipBadge` — boolean

#### Get profile by ID

Requires [Authorization](#api-authorization).

```
GET /v7/profiles/{id}
```

Query:

- `id` — profile ID

#### Get multiple profiles by ID

Requires [Authorization](#api-authorization).

```
POST /v3/profiles
```

Body:

- `targetProfileIds` — array of strings with numeric ids

Response:

- `profiles` — array of [Profile](#profile)

#### Update own profile (full)

WIP

Requires [Authorization](#api-authorization).

```
PUT /v3.1/me/profile
```

Body:

[Profile](#profile) object, fully replaces current version.

#### Update own profile (partial)

WIP

Requires [Authorization](#api-authorization).

```
PATCH /v4/me/profile
```

Body:

[Profile](#profile) object, only updates specified keys.

#### Delete own profile

WIP

Requires [Authorization](#api-authorization).

```
DELETE /v3/me/profile
```

#### Delete profile photos

WIP

Requires [Authorization](#api-authorization).

```
DELETE /v3/me/profile/images
```

Body:

- `media_hashes` — array of strings

#### Check if profiles are reachable

WIP

Requires [Authorization](#api-authorization).

```
POST /v4/profiles/reachable
```

Body:

- `profileIds` — array of strings with numeric ids

Response:

- `profileIds` — array of strings with numeric ids

### Favorites

#### Add favorite

Requires [Authorization](#api-authorization).

```
POST /v3/me/favorites/{profileId}
```

Response:

Empty object (`{}`).

#### Remove favorite

Requires [Authorization](#api-authorization).

```
DELETE /v3/me/favorites/{profileId}
```

Response:

Empty object (`{}`).

#### Get all notes

Requires [Authorization](#api-authorization).

```
GET /v1/favorites/notes
```

Response:

Array of objects:

- `notes` — string
- `phoneNumber` — string, might be empty
- `counterpartyId` — profile ID

#### Get note

Requires [Authorization](#api-authorization).

```
GET /v1/favorites/notes/{targetProfileId}
```

Response:

- `notes` — string, empty for non existing notes
- `phoneNumber` — string, might be empty

#### Add note

Requires [Authorization](#api-authorization).

```
PUT /v1/favorites/notes/{targetProfileId}
```

- `notes` — string, required
- `phoneNumber` — string, required

*The `counterpartyId` parameter seems to be ignored, it's unknown what its purpose is.*

Response:

Empty, HTTP status 204.

#### Delete note

Requires [Authorization](#api-authorization).

```
DELETE /v1/favorites/notes/{targetProfileId}
```

*Essentially equivalent to [Add note](#add-note) with `notes` set to `""`.*

### Location

#### Geohash

Grindr requires geohash to be exactly 12 characters long.

<https://en.wikipedia.org/wiki/Geohash>

Example: `gcw2jp5u2d1b`

Geohash explorer: <https://geohash.softeng.co/>

#### Search places by name

Requires [Authorization](#api-authorization).

```
GET /v3/places/search
```

Query:

- `placeName` — string, e.g. `Paris`

Response:

- `places` — array of objects
  - `name` — string
  - `address` — string
  - `lat` — number
  - `lon` — number
  - `placeId` — string with number
  - `importance` — float

#### Update location

Requires [Authorization](#api-authorization).

```
PUT /v4/location
```

Body: 

- `geohash` — string, exactly 12 characters, see [geohash](#geohash)

Response:

Empty.

### Interest

#### ViewSourceEnum

- `DISCOVER`
- `FOR_YOU`
- `UNKNOWN` (fallback)

#### Record profile views (batch)

WIP

Requires [Authorization](#api-authorization).

```
POST /v4/views
```

Body:

- `viewedProfileIds` — array of strings with numeric ids
- `foundVia` — unknown or `null`

#### Record single profile view

WIP

Requires [Authorization](#api-authorization).

```
POST /v4/views/{profileId}
```

#### Record profile view v2

WIP

Requires [Authorization](#api-authorization).

```
POST /v5/views/{profileId}
```

Body:

- `foundVia` — unknown or `null`
- `source` — [ViewSourceEnum](#viewsourceenum)

#### Get sent taps

WIP

```
GET /v1/interactions/taps/sent
```

#### Send a tap

WIP

```
POST /v2/taps/add
```

#### Get received taps

WIP

```
GET /v2/taps/received
```

#### Get views number

Requires [Authorization](#api-authorization).

```
GET /v6/views/eyeball
```

Response:

- `viewedCount` — number or `null`
- `mostRecent` — object or `null`
	`profileId` — string with number
	`photoHash` — 40 characters hex string
	`timestamp` — unix timestamp in milliseconds

#### Get viewers list

WIP

Requires [Authorization](#api-authorization).

```
GET /v7/views/list
```

### Managed fields

Managed fields are profile fields that aren't hardcoded but pulled dynamically from server, such as pronouns, ethnicity and relationship statuses.

#### Pronouns

Requires [Authorization](#api-authorization).

```
GET /v1/pronouns
```

Response:

Array of objects:

- `pronounId` — integer
- `pronoun` — string, e.g. `"-"` or `"They/Them/Theirs"`

#### Genders

```
GET /public/v2/genders
```

Response:

Array of objects:

- `genderId` — integer
- `gender` — string
- `displayGroup` — integer
- `sortProfile` — integer or `null`
- `sortFilter` — integer or `null`
- `genderPlural` — string or `null`
- `excludeOnProfileSelection` — array of integers or `null`
- `excludeOnFilterSelection` — array of integers or `null`
- `alsoClassifiedAs` — array of integers

#### Suggest gender or pronoun

Requires [Authorization](#api-authorization).

```
PUT /v4/genderpronoun/suggestions
```

Body:

- `category` — string, either `gender` or `pronoun`
- `suggestedValue` — string

Response:

Empty

### Hardcoded fields

#### Profile tags

Requires [Authorization](#api-authorization).

```
GET /v1/tags
```

Response:

Array of objects:

- `language` — string
- `categoryCollection` — array of objects
  - `text` — string
  - `possessiveText` string or `null`
  - `tags` — array of objects
    - `tagId` — integer
    - `text` — string
    - `key` — string

#### Position ID

- 1 — "Top"
- 2 — "Bottom"
- 3 — "Versatile"
- 4 — "Vers Bottom"
- 5 — "Vers Top"
- 6 — "Side"

#### Ethnicity

- 1 — Asian
- 2 — Black
- 3 — Latino
- 4 — Middle Eastern
- 5 — Mixed
- 6 — Native American
- 7 — White
- 8 — Other
- 9 — South Asian

#### Relationship status

- 1 — Single
- 2 — Dating
- 3 — Exclusive
- 4 — Committed
- 5 — Partnered
- 6 — Engaged
- 7 — Married
- 8 — Open Relationship

#### Body type

- 1 — "Toned"
- 2 — "Average"
- 3 — "Large"
- 4 — "Muscular"
- 5 — "Slim"
- 6 — "Stocky"

#### HIV status

- 1 — "Negative"
- 2 — "Negative, on PrEP"
- 3 — "Positive"
- 4 — "Positive, undetectable"

#### Accept NSFW pics

- 1 — "Never"
- 2 — "Not At First"
- 3 — "Yes Please"

#### Meet at

- 1 — "My Place"
- 2 — "Your Place"
- 3 — "Bar"
- 4 — "Coffee Shop"
- 5 — "Restaurant"

#### Sexual health

- 1 — "Condoms"
- 2 — "I'm on doxyPEP"
- 3 — "I'm on PrEP"
- 4 — "I'm HIV undetectable"
- 5 — "Prefer to discuss"

#### Looking for

- 2 — Chat
- 3 — Dates
- 4 — Friends
- 5 — Networking
- 6 — Relationship
- 7 — Hookups

#### Tribes

- 1 — "Bear"
- 2 — "Clean-Cut"
- 3 — "Daddy"
- 4 — "Discreet"
- 5 — "Geek"
- 6 — "Jock"
- 7 — "Leather"
- 8 — "Otter"
- 9 — "Poz"
- 10 — "Rugged"
- 11 — "Sober"
- 12 — "Trans"
- 13 — "Twink"

#### Vaccines

- 1 - COVID-19
- 2 — Monkeypox
- 3 — Meningitis

## Right Now

WIP

### RightNowStatusEnum

- `NOT_ACTIVE`
- `HOSTING`
- `NOT_HOSTING`

## Rate limits

WIP, help with this section is greatly appreciated.