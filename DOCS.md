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
				- [`"VideoCall"`](#videocall)
				- [`"Unknown"`](#unknown)
			- [List messages in conversation](#list-messages-in-conversation)
			- [Get a single message in conversation](#get-a-single-message-in-conversation)
			- [Send a message to conversation](#send-a-message-to-conversation)
			- [Unsend a message](#unsend-a-message)
			- [Delete a message](#delete-a-message)
			- [Send typing indicator](#send-typing-indicator)
			- [React to a message](#react-to-a-message)
		- [Albums](#albums)
			- [AlbumExpirationType](#albumexpirationtype)
			- [AlbumPreview](#albumpreview)
			- [AlbumMin](#albummin)
			- [AlbumContentMin](#albumcontentmin)
			- [AlbumContent](#albumcontent)
			- [AlbumCoverUrl](#albumcoverurl)
			- [Get my albums](#get-my-albums)
			- [Get an album](#get-an-album)
			- [Get an album media poster](#get-an-album-media-poster)
			- [Record view of an album](#record-view-of-an-album)
			- [Record view of media in an album](#record-view-of-media-in-an-album)
			- [Get info about profile's album](#get-info-about-profiles-album)
			- [Get albums shared by a profile](#get-albums-shared-by-a-profile)
			- [Create an album](#create-an-album)
			- [Rename an album](#rename-an-album)
			- [Delete an album](#delete-an-album)
			- [Upload media to an album](#upload-media-to-an-album)
			- [Reorder media in an album](#reorder-media-in-an-album)
			- [Delete a media from an album](#delete-a-media-from-an-album)
			- [Albums content processing, WIP](#albums-content-processing-wip)
			- [Share an album](#share-an-album)
			- [Get album shares](#get-album-shares)
			- [Unshare an album](#unshare-an-album)
			- [Unshare an album from everybody](#unshare-an-album-from-everybody)
			- [Albums content chat list-by-id, WIP](#albums-content-chat-list-by-id-wip)
			- [Get album limits](#get-album-limits)
			- [Albums red dot, WIP](#albums-red-dot-wip)
			- [Pressie albums feed, WIP](#pressie-albums-feed-wip)
			- [Pressie albums feed paywall, WIP](#pressie-albums-feed-paywall-wip)
			- [Pressie albums feed profile ID, WIP](#pressie-albums-feed-profile-id-wip)
			- [Pressie albums feed update read, WIP](#pressie-albums-feed-update-read-wip)
		- [Misc](#misc)
			- [Translate a message](#translate-a-message)
			- [OCR recognition in chat](#ocr-recognition-in-chat)
			- [Rate an AI message suggestion](#rate-an-ai-message-suggestion)
	- [Users](#users)
		- [Profiles](#profiles)
			- [ProfileMaskedMin](#profilemaskedmin)
			- [ProfileMasked](#profilemasked)
			- [ProfileMin](#profilemin)
			- [ProfileShort](#profileshort)
			- [Profile](#profile)
			- [Get profile by ID](#get-profile-by-id)
			- [Get multiple profiles by ID](#get-multiple-profiles-by-id)
			- [Update own profile (full)](#update-own-profile-full)
			- [Update own profile (partial)](#update-own-profile-partial)
			- [Delete own profile](#delete-own-profile)
			- [Delete profile photos](#delete-profile-photos)
			- [Check if profiles are reachable](#check-if-profiles-are-reachable)
		- [Assignments](#assignments)
		- [Media](#media)
			- [Public CDN files](#public-cdn-files)
				- [Profile images](#profile-images)
				- [Thumbnails images](#thumbnails-images)
				- [Grindr Gaymoji](#grindr-gaymoji)
				- [GaymojiCategory](#gaymojicategory)
			- [Signed CDN files](#signed-cdn-files)
			- [Chat media](#chat-media)
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
			- [Tap ID](#tap-id)
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

- `profileId` — string with numbers, account's ID
- `sessionId` — JWT token (see [Session ID](#session-id))

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
		- `primaryMediaHash` — unknown, appears to be `null`, see [Media](#media)
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
- `dynamic` — boolean, unknown purpose, WIP
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

Payload in [`body`](#message) based on [message's `type`](#message-type), might be `null` for [unsent](#unsend-a-message) messages.

##### `"Album"`

- *everything from [AlbumPreview]*
- `coverUrl` —  [AlbumCoverUrl](#AlbumCoverUrl)
- `ownerProfileId` — number or `null`
- `isViewable` — boolean
- `hasVideo` — boolean
- `hasPhoto` — boolean
- `viewableUntil` — number or `null`
- `expiresAt` — integer or `null`
- `expirationType` —  string or `null`

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
- `mediaHash` — string or `null`
- `url` — string, see [Signed CDN files -> Chat media](#chat-media)
- `contentType` — string, e.g. `audio/aac`
- `length` — number in milliseconds (1/1000th of a second) or `null`
- `expiresAt` — unix timestamp in milliseconds, 15 minutes

##### `"Video"`

- `mediaId` — number or `null`
- `url` — string or `null`
- `fileCacheKey` — string
- `contentType` — string or `null`
- `length` — number
- `maxViews` — integer or `null`
- `looping` — boolean or `null`

Additionally, for expiring videos:

- `viewsRemaining` — integer, capped at `2147483647` for "unlimited" views

##### `"PrivateVideo"`

- *everything from [Video](#video)*
- `viewCount` — integer

##### `"NonExpiringVideo"`

Unknown, WIP

##### `"Gaymoji"`

- `imageHash` — string

##### `"Generative"`

Unknown, WIP

##### `"Giphy"`

URLs point at `https://media0.giphy.com`

- `id` — string
- `urlPath` — string, full URL to gif file
- `stillPath` — string, single frame, URL to gif file
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

Additionally, only for regular images:

- `takenOnGrindr` — boolean or `null`
- `createdAt` — number or `null`

##### `"ExpiringImage"`

- *everything from [Image](#image)*
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

##### `"VideoCall"`

Only for "status" messages:

- `result` — string or `null`, appears to have the following values: `SUCCESSFUL`, `Duration:`, `Busy`, `BUSY`, `Cancelled`, `Declined`, `DECLINED`, `Missed`, `AB_Unsupported`, `No_Answer`, `UNANSWERED`, `Lite_Unsupport`
- `videoCallDuration` — number or `null`

##### `"Unknown"`

Empty type

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

WIP, does not seem to work.

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

### Albums

WIP. No idea what SpankBank, pressie albums and paywalled albums are.

#### AlbumExpirationType

- `INDEFINITE` — "Indefinitely"
- `ONCE` — "View Once"
- `TEN_MINUTES` — "For 10 Minutes"
- `ONE_HOUR` — "For 60 Minutes"
- `ONE_DAY` — "For 24 Hours"

#### AlbumPreview

- `albumId` — long integer
- `albumNumber` — integer
- `totalAlbumsShared` — integer
- `hasUnseenContent` — boolean

#### AlbumMin

- *everything from [AlbumPreview](#AlbumPreview)*
- `albumName` — unknown or `null`
- `profileId` — integer
- `albumViewable` — boolean

#### AlbumContentMin

- `contentId` — long integer
- `contentType` — string
- `coverUrl` — [AlbumCoverUrl](#AlbumCoverUrl)
- `statusId` — unknown integer, WIP

#### AlbumContent

- *everything from [AlbumContentMin](#AlbumContentMin)*
- `thumbUrl` — string, unblurred preview, see [Media -> Signed CDN files](#signed-cdn-files)
- `url` — string, original file, see [Media -> Signed CDN files](#signed-cdn-files)
- `processing` — boolean
- `remainingViews` — integer, might be -1
- `rejectionId` - unknown or null

#### AlbumCoverUrl

String with URL or `null`, blurred downscaled preview.

JPEG photo with the first frame of video in case of video files.

See [Media -> Signed CDN files](#signed-cdn-files).

#### Get my albums

Requires [Authorization](#api-authorization).

```
GET /v1/albums
```

Response:

- `albums` — array of album, WIP

#### Get an album

Requires [Authorization](#api-authorization).

```
GET /v2/albums/{albumId}
```

Response:

- *everything from [AlbumMin](#albummin)*
- `content` — array of [AlbumContent](#albumcontent)
- `sharedCount` — integer
- `createdAt` — string, date formatted as ISO 8601, e.g. `2026-03-27T20:39:00`
- `updatedAt` — string, date formatted as ISO 8601, e.g. `2026-03-27T20:39:00`

Errors:

- HTTP status 403 — if you don't have access to album or it doesn't exist

#### Get an album media poster

Requires [Authorization](#api-authorization).

```
GET /v1/albums/{albumId}/content/{contentId}/poster
```

Response:

- `blurredPosterUrl` — string, see [Media -> Signed CDN files](#signed-cdn-files)
- `posterUrl` — string, see [Media -> Signed CDN files](#signed-cdn-files)

#### Record view of an album

WIP

```
GET /v3/albums/{albumId}/view
```

#### Record view of media in an album

WIP

```
POST /v1/albums/{albumId}/view/content/{contentId}
```

Response:

- `remainingViews` — integer

#### Get info about profile's album

Requires [Authorization](#api-authorization).

```
POST /v2/albums/shares
```

Body:

- `profileId` — integer

Response:

- `profileId` — long integer
- `hasAlbum` — boolean
- `hasSharedWithMe` — boolean

#### Get albums shared by a profile

Requires [Authorization](#api-authorization).

```
GET /v2/albums/shares/{profileId}
```

Response:

- `albums` — array of objects
  - *everything from [AlbumMin](#albummin)*
  - `content` — a single [AlbumContentMin](#albumcontentmin), a blurred preview
  - `contentCount` — object
    - `imageCount` — integer
    - `videoCount` — integer
  - `expiresAt` — integer or `null`
  - `expirationType` — [AlbumExpirationType](#albumexpirationtype)

#### Create an album

WIP

```
POST /v2/albums
```

Body:

- `albumName` — string

Response:

- `albumId` — long integer

#### Rename an album

WIP

```
PUT /v2/albums/{albumId}
```

Body:

- `albumName` — string

Response:

- `albumName` — string

#### Delete an album

WIP

```
DELETE /v1/albums/{albumId}
```

#### Upload media to an album

WIP

```
POST /v1/albums/{albumId}/content
```

Query:

- `width` — number
- `height` — number
- `isFresh` — boolean

Body:

MultipartBody

Response:

- `contentId` — Media file ID

#### Reorder media in an album

WIP

```
POST /v1/albums/{albumId}/content/order
```

Body:

- `contentIds` — array of long integers

#### Delete a media from an album

WIP

```
DELETE /v1/albums/{albumId}/content/{contentId}
```

#### Albums content processing, WIP

WIP

```
GET /v1/albums/{albumId}/content/{contentId}/processing
```

Response:

- `processing` — boolean

#### Share an album

Requires [Authorization](#api-authorization).

```
POST /v4/albums/{albumId}/shares
```

Body:

- `profiles` — array of objects
  - `expirationType` — [AlbumExpirationType](#albumexpirationtype)
  - `profileId` — integer

#### Get album shares

WIP

Returns profiles the album was shared with.

```
GET /v1/albums/{albumId}/shares
```

- `profileIds` — array of strings

#### Unshare an album

WIP

```
PUT /v1/albums/{albumId}/unshares
```

Body:

- `profiles` — array of objects
  - `expiresAt` — long integer or `null`
  - `profileId` — long integer or `null`

#### Unshare an album from everybody

WIP

```
PUT /v1/albums/{albumId}/shares/remove
```

#### Albums content chat list-by-id, WIP

WIP

```
POST /v1/albums/{albumId}/content/chat/list-by-id
```

Query:

- `isFresh` — boolean

Body:

- `ids` — array of long integers

#### Get album limits

Requires [Authorization](#api-authorization).

```
GET /v1/albums/storage
```

Response:

- `subscriptionType` — string, e.g. `FreeAlbums`
- `maxAlbums` — integer
- `maxContentItemsPerAlbum` — integer
- `maxShares` — integer
- `maxViewableAlbums` — integer
- `maxViewableVideos` — integer
- `maxContentSize` — long integer, size in bytes
- `maxContentSizeHumanReadable` — string, incorrectly uses decimal multiples notation (MB) when in fact calculates binary notation (MiB), so API's `120.00 MB` is actually 120 MiB or 125.8291 MB
- `maxVideoLength` — long integer, length in milliseconds (1/1000th of a second)
- `minVideoLength` — long integer, length in milliseconds (1/1000th of a second)
- `maxShareableAlbums` — integer
- `maxVideosPerAlbum` — integer

#### Albums red dot, WIP

WIP

```
PUT /v1/albums/red-dot
```

#### Pressie albums feed, WIP

WIP

```
POST /v3/pressie-albums/feed
```

#### Pressie albums feed paywall, WIP

WIP

```
POST /v3/pressie-albums/feed/paywall/
```

#### Pressie albums feed profile ID, WIP

WIP

```
GET /v3/pressie-albums/feed/{profileId}
```

#### Pressie albums feed update read, WIP

WIP

```
POST /v3/pressie-albums/feed/update/read
```

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

#### ProfileMaskedMin

- `distance` — number or `null`
- `profileImageMediaHash` — string or `null`, see [Media](#media)
- `isFavorite` — boolean

#### ProfileMasked

- *everything from [ProfileMaskedMin](#profilemaskedmin)*
- `lastViewed` — number or `null`
- `seen` — unix timestamp in milliseconds or `null`
- `sexualPosition` — integer or `null`, see [Position ID](#position-id)
- `foundVia` — [ViewSourceEnum](#viewsourceenum) or `null`
- `rightNow` — [RightNowStatusEnum](#rightnowstatusenum)

#### ProfileMin

- `profileId` — string with numeric id
- `displayName` — string or `null`
- `onlineUntil` — long number or `null`

#### ProfileShort

- *everything from [ProfileMasked](#profilemasked)*
- *everything from [ProfileMin](#profilemin)*
- `age` — number, may be `0` or `null`
- `showAge` — boolean
- `showDistance` — boolean
- `approximateDistance` — boolean
- `lastChatTimestamp` — number, may be `0`
- `isNew` — boolean
- `lastUpdatedTime` — unix timestamp in milliseconds, may be `0`
- `medias` — array of profile photos objects
  - `mediaHash` — string, see [Media](#media)
  - `type` — integer
  - `state` — integer
  - `reason` — string or `null`
  - `takenOnGrindr` — boolean or `null`
  - `createdAt` — long number or `null`

#### Profile

- *everything from [ProfileShort](#profileshort)*
- `aboutMe` — string or `null`
- `ethnicity` — integer or `null`, see [Ethnicity](#ethnicity)
- `relationshipStatus` — integer or `null`, see [Relationship status](#relationship-status)
- `grindrTribes` — array of integers, see [Tribes](#tribes)
- `lookingFor` — array of integers, see [Looking for](#looking-for)
- `vaccines` — array of integers, see [Vaccines](#vaccines)
- `bodyType` — number or `null`, see [Body type](#body-type)
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
- `identity` — identity (unknown, wip) or `null`
- `meetAt` — array of integers, see [Meet at](#meet-at)
- `nsfw` — integer or `null`, see [Accept NSFW pics](#accept-nsfw-pics)
- `hashtags` — unknown array
- `profileTags` — array of strings, see [Profile tags](#profile-tags)
- `genders` — array of integers, see [Genders](#genders)
- `pronouns` — array of integers, see [Pronouns](#pronouns)
- `tapped` — boolean
- `tapType` — boolean
- `lastReceivedTapTimestamp` — number or `null`
- `isTeleporting` — boolean
- `isRoaming` — boolean
- `arrivalDays` — number or `null`
- `unreadCount` — number, may be absent
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

### Assignments

WIP

GET /v3/assignment

### Media

Media files in Grindr are stored on cdns.grindr.com:443 hosted by Amazon CloudFront powered by AmazonS3. All CDN files are accessible without [authorization](#api-authorization) but some are protected with signed URLs. No [security headers](#security-headers) or `Authorization` need to be present in reuqest to CDN.

Caching is supported via [ETag header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag) — MD5 hash of image file. Image files might have `image/jpeg`, `image/png` or `image/webp` type, based on original.

Media files are identified by either a 40-character (public files) or 64-character (signed files) hexademical string. Although not confirmed for all types of media, it appears to be SHA-1 hash for 40-character hash and SHA-256 hash for 64-character hash. Confirmed cases: [Audio](#audio) uses SHA-256 for its 64-character mediaHash.

There are two types of files stored on CDN.

#### Public CDN files

CDN files that are public are accessible directly using their hash, e.g. [profile images](#profile-images)

Base URL:

```
https://cdns.grindr.com
```

##### Profile images

```
/images/profile/{size}/{mediaHash}
```

One side will always be the requested size and another will be less or equal to the requested size.

Available sizes for `{size}` parameter:

- `2048x2048` (might be unavailable)
- `1024x1024`
- `480x480`
- `320x320`

##### Thumbnails images

```
/images/thumb/{size}/{mediaHash}
```

Image will be cropped at center and both sides will be exactly the requested size.

Available sizes for `{size}` parameter:
- `480x480` (might be unavailable)
- `320x320`
- `75x75`

##### Grindr Gaymoji

List gaymojis:

```
/grindr/chat/gaymoji
```

Response:

Formatted JSON object:

- `lastUpdateTime` — unix timestamp in milliseconds
- `gaymoji` — array of objects
  - `name` — unique identificator consisting of alphanumeric characters, hyphens and underscores
  - `id` — same as `name` + `.png`
  - `category` — [GaymojiCategory](#gaymojicategory)
- `category` — array of objects
  - `name` — [GaymojiCategory](#gaymojicategory)
  - `expiredTime` — unix timestamp in milliseconds, may be `0`

The image file assosiated with the Gaymoji is hosted at:

```
/grindr/chat/gaymoji/{id}
```

ID must include file extension.

##### GaymojiCategory

One of the following values:

- `body`
- `dating+sex`
- `featured`
- `holiday`
- `mood`
- `objects`
- `profile`
- `wen_ching_taiwan_stickers`

#### Signed CDN files

CDN files accessible via signed URLs signed with `Signature` query argument. New signed URLs are generated and populated in API responses when existing URL expires. `Expires` query argument holds expiration date in unix timestamp in seconds, 15 minutes.

Base URL appears to be:

```
https://d2wxe7lth7kp8g.cloudfront.net/
```

Although it might change in the future, so it's best to pull full URL from `url` property on media object itself.

#### Chat media

Media uploaded directly to DMs are accessible by this URL:

```
/{uploaderProfileId}/{mediaHash}?Expires={unixTimestampSeconds}&Signature={signature}&Key-Pair-Id={keyPairId}
```

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

#### Tap ID

- `0` — "FRIENDLY" ("hi" or 🍪 based on client's rendering settings)
- `1` — "HOT" (🔥)
- `2` — "LOOKING" (😈)
- `3` — "NONE"

Cookie taps are essentially bubbles "hi" but your client can choose to render them as 🍪. There is no separate cookie tap type.

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

Requires [Authorization](#api-authorization).

```
GET /v1/interactions/taps/sent
```

#### Send a tap

Requires [Authorization](#api-authorization).

Repeated requests result in `Invalid request` error and HTTP status 400.

```
POST /v2/taps/add
```

Body:

- `recipientId` — long integer, [profile id](#profile)
- `tapType` — [Tap ID](#tap-id), invalid or non existing Tap IDs are still recorded as successfull

Response:

- `isMutual` — boolean

#### Get received taps

Requires [Authorization](#api-authorization).

```
GET /v2/taps/received
```

Response:

- `profiles`
	- *everything from [ProfileMaskedMin](#profilemaskedmin)*
	- *everything from [ProfileMin](#profilemin)*
	- `timestamp`
	- `tapType`
	- `lastOnline`
	- `isBoosting`
	- `isMutual`
	- `rightNowType`
	- `isViewable`

#### Get views number

Requires [Authorization](#api-authorization).

```
GET /v6/views/eyeball
```

Response:

- `viewedCount` — number or `null`
- `mostRecent` — object or `null`
	- `profileId` — string with number
	- `photoHash` — 40 characters hex string
	- `timestamp` — unix timestamp in milliseconds

#### Get viewers list

Requires [Authorization](#api-authorization).

```
GET /v7/views/list
```

Response:

- `totalViewers` — integer
- `previews` — array of objects
  - *everything from [ProfileMasked](#profilemasked)*
  - `isInBadNeighborhood` — boolean
  - `isViewedMeFreshFace` — boolean
  - `isSecretAdmirer` — boolean
  - `viewedCount` — object
    - `totalCount` — integer
    - `maxDisplayCount` — integer
- `profiles` — array of objects
  - *everything from `previews`*
  - *everything from [ProfileShort](#profileshort)*
  - `hasFaceRecognition` — boolean
  - `isIncognito` — boolean
  - `boosting` — boolean
  - `showUnlockReward` — boolean
  - `unreadMessageCount` — integer
  - `hasChatted` — boolean

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