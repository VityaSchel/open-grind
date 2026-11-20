# Roger stream

WebSocket URL:

```
wss://grindr.mobi/v1/roger/stream
```

Same connection headers as the [main WebSocket](/grindr-api/websocket/). It carries [Roger](/grindr-api/messaging/roger) chats: send a request frame, then read reply frames with the same `requestId` until a terminal one.

## Request frame

- `requestId` — string, client-chosen ID, e.g. a UUID
- `threadId` — string, from [Start Roger thread](/grindr-api/messaging/roger#start-roger-thread)
- `message` — string, message text
- `type` — string, `"message"`, or `"image"` to ask for a photo

## Reply frames

- `type` — string, frame type, see below
- `requestId` — string or `null`, `requestId` of the request frame
- `content` — string or `null`, next text chunk of a `chat` frame
- `fullContent` — string or `null`, full reply text of a `complete` frame
- `mediaType` — string or `null`, e.g. `"image"`, for a `media` frame
- `mediaUrl` — string or `null`, URL for a `media` frame
- `errorClass` — string or `null`, for an `error` frame
- `retryable` — boolean

Frame types:

- `chat` — a chunk of the reply text
- `media` — a photo
- `complete` — the reply is finished; ends the request
- `retracted` — the reply was withdrawn; ends the request
- `error` — the request failed; ends the request. `requestId` may be `null`.
