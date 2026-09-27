#include <sys/socket.h>
#include <unistd.h>

#include <gio/gunixfdlist.h>
#include <gio/gunixinputstream.h>
#include <gst/base/gstbasesrc.h>
#include <gst/gst.h>
#include <webkit2/webkit-web-extension.h>

#define OPEN_MESSAGE "ogmedia-open"
#define SKIP_FORWARD_LIMIT (512 * 1024)
#define REOPENS_PER_READ 2

static WebKitWebExtension *web_extension;

typedef struct {
	GstBaseSrc parent;
	GMutex lock;
	gchar *uri;
	GInputStream *stream;
	GCancellable *cancellable;
	guint64 position;
	guint64 size;
} OgMediaSrc;

typedef struct {
	GstBaseSrcClass parent_class;
} OgMediaSrcClass;

static void og_media_src_uri_handler_init(gpointer iface, gpointer data);

G_DEFINE_TYPE_WITH_CODE(OgMediaSrc, og_media_src, GST_TYPE_BASE_SRC,
	G_IMPLEMENT_INTERFACE(GST_TYPE_URI_HANDLER, og_media_src_uri_handler_init))

enum { PROP_0, PROP_LOCATION };

static gboolean send_on_main_thread(gpointer message)
{
	webkit_web_extension_send_message_to_context(web_extension, message, NULL, NULL, NULL);
	g_object_unref(message);
	return G_SOURCE_REMOVE;
}

static GInputStream *request_bytes(const gchar *uri, guint64 offset)
{
	int pair[2];
	if (socketpair(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0, pair) < 0)
		return NULL;
	GUnixFDList *fds = g_unix_fd_list_new();
	gint appended = g_unix_fd_list_append(fds, pair[1], NULL);
	close(pair[1]);
	if (appended < 0) {
		g_object_unref(fds);
		close(pair[0]);
		return NULL;
	}
	WebKitUserMessage *message = webkit_user_message_new_with_fd_list(OPEN_MESSAGE, g_variant_new("(st)", uri, offset), fds);
	g_object_unref(fds);
	g_main_context_invoke(NULL, send_on_main_thread, g_object_ref_sink(message));
	return g_unix_input_stream_new(pair[0], TRUE);
}

static void fail_with_status(OgMediaSrc *src, guint64 status)
{
	if (status == 404 || status == 410)
		GST_ELEMENT_ERROR(src, RESOURCE, NOT_FOUND, (NULL), ("HTTP %" G_GUINT64_FORMAT, status));
	else if (status == 401 || status == 403)
		GST_ELEMENT_ERROR(src, RESOURCE, NOT_AUTHORIZED, (NULL), ("HTTP %" G_GUINT64_FORMAT, status));
	else
		GST_ELEMENT_ERROR(src, RESOURCE, READ, (NULL), ("HTTP %" G_GUINT64_FORMAT, status));
}

static GstFlowReturn open_at(OgMediaSrc *src, guint64 offset)
{
	g_mutex_lock(&src->lock);
	g_clear_object(&src->stream);
	GCancellable *cancellable = g_object_ref(src->cancellable);
	g_mutex_unlock(&src->lock);
	GInputStream *stream = request_bytes(src->uri, offset);
	if (!stream) {
		g_object_unref(cancellable);
		GST_ELEMENT_ERROR(src, RESOURCE, OPEN_READ, (NULL), ("socketpair failed"));
		return GST_FLOW_ERROR;
	}
	guint64 header[2];
	gsize got = 0;
	GError *error = NULL;
	gboolean read = g_input_stream_read_all(stream, header, sizeof(header), &got, cancellable, &error);
	gboolean cancelled = g_cancellable_is_cancelled(cancellable);
	if (!read || got != sizeof(header)) {
		g_clear_error(&error);
		g_object_unref(stream);
		g_object_unref(cancellable);
		if (cancelled)
			return GST_FLOW_FLUSHING;
		GST_ELEMENT_ERROR(src, RESOURCE, OPEN_READ, (NULL), ("no answer for offset %" G_GUINT64_FORMAT, offset));
		return GST_FLOW_ERROR;
	}
	guint64 status = GUINT64_FROM_LE(header[0]);
	if (status != 200 && status != 206) {
		g_object_unref(stream);
		g_object_unref(cancellable);
		fail_with_status(src, status);
		return GST_FLOW_ERROR;
	}
	g_mutex_lock(&src->lock);
	cancelled = g_cancellable_is_cancelled(cancellable);
	if (!cancelled) {
		src->stream = stream;
		src->size = GUINT64_FROM_LE(header[1]);
		src->position = offset;
	}
	g_mutex_unlock(&src->lock);
	g_object_unref(cancellable);
	if (cancelled) {
		g_object_unref(stream);
		return GST_FLOW_FLUSHING;
	}
	return GST_FLOW_OK;
}

static void skip_forward(OgMediaSrc *src, guint64 offset)
{
	if (!src->stream || offset <= src->position || offset - src->position > SKIP_FORWARD_LIMIT)
		return;
	while (src->position < offset) {
		gssize skipped = g_input_stream_skip(src->stream, offset - src->position, src->cancellable, NULL);
		if (skipped <= 0)
			return;
		src->position += skipped;
	}
}

static gboolean read_fully(OgMediaSrc *src, guint8 *data, gsize length, gsize *filled, GError **error)
{
	*filled = 0;
	while (*filled < length) {
		gssize n = g_input_stream_read(src->stream, data + *filled, length - *filled, src->cancellable, error);
		if (n < 0)
			return FALSE;
		if (n == 0)
			return TRUE;
		*filled += n;
	}
	return TRUE;
}

static GstFlowReturn og_media_src_create(GstBaseSrc *base, guint64 offset, guint length, GstBuffer **out)
{
	OgMediaSrc *src = (OgMediaSrc *)base;
	if (src->size && offset >= src->size)
		return GST_FLOW_EOS;
	if (src->size && offset + length > src->size)
		length = src->size - offset;
	skip_forward(src, offset);
	GstBuffer *buffer = gst_buffer_new_allocate(NULL, length, NULL);
	GstMapInfo map;
	gst_buffer_map(buffer, &map, GST_MAP_WRITE);
	gsize filled = 0;
	for (int attempt = 0; filled == 0 && attempt <= REOPENS_PER_READ; attempt++) {
		if (!src->stream || src->position != offset) {
			GstFlowReturn opened = open_at(src, offset);
			if (opened != GST_FLOW_OK) {
				gst_buffer_unmap(buffer, &map);
				gst_buffer_unref(buffer);
				return opened;
			}
		}
		GError *error = NULL;
		if (!read_fully(src, map.data, length, &filled, &error)) {
			gboolean cancelled = g_error_matches(error, G_IO_ERROR, G_IO_ERROR_CANCELLED);
			g_clear_error(&error);
			if (cancelled) {
				gst_buffer_unmap(buffer, &map);
				gst_buffer_unref(buffer);
				return GST_FLOW_FLUSHING;
			}
		}
		if (filled == 0)
			g_clear_object(&src->stream);
	}
	gst_buffer_unmap(buffer, &map);
	if (filled == 0) {
		gst_buffer_unref(buffer);
		GST_ELEMENT_ERROR(src, RESOURCE, READ, (NULL), ("stream ended at %" G_GUINT64_FORMAT " of %" G_GUINT64_FORMAT, offset, src->size));
		return GST_FLOW_ERROR;
	}
	gst_buffer_set_size(buffer, filled);
	GST_BUFFER_OFFSET(buffer) = offset;
	GST_BUFFER_OFFSET_END(buffer) = offset + filled;
	src->position = offset + filled;
	*out = buffer;
	return GST_FLOW_OK;
}

static gboolean og_media_src_get_size(GstBaseSrc *base, guint64 *size)
{
	OgMediaSrc *src = (OgMediaSrc *)base;
	*size = src->size;
	return src->size > 0;
}

static gboolean og_media_src_is_seekable(GstBaseSrc *base)
{
	return TRUE;
}

static gboolean og_media_src_query(GstBaseSrc *base, GstQuery *query)
{
	if (GST_QUERY_TYPE(query) != GST_QUERY_SCHEDULING)
		return GST_BASE_SRC_CLASS(og_media_src_parent_class)->query(base, query);
	gst_query_set_scheduling(query, GST_SCHEDULING_FLAG_SEEKABLE | GST_SCHEDULING_FLAG_SEQUENTIAL, 1, -1, 0);
	gst_query_add_scheduling_mode(query, GST_PAD_MODE_PUSH);
	return TRUE;
}

static gpointer open_first_bytes(gpointer data)
{
	OgMediaSrc *src = data;
	GstFlowReturn opened = open_at(src, 0);
	gst_base_src_start_complete(GST_BASE_SRC(src), opened);
	gst_object_unref(src);
	return NULL;
}

static gboolean og_media_src_start(GstBaseSrc *base)
{
	OgMediaSrc *src = (OgMediaSrc *)base;
	if (!src->uri)
		return FALSE;
	src->size = 0;
	src->position = 0;
	g_thread_unref(g_thread_new("ogmedia-start", open_first_bytes, gst_object_ref(src)));
	return TRUE;
}

static gboolean og_media_src_stop(GstBaseSrc *base)
{
	OgMediaSrc *src = (OgMediaSrc *)base;
	g_mutex_lock(&src->lock);
	g_clear_object(&src->stream);
	g_mutex_unlock(&src->lock);
	return TRUE;
}

static gboolean og_media_src_unlock(GstBaseSrc *base)
{
	OgMediaSrc *src = (OgMediaSrc *)base;
	g_mutex_lock(&src->lock);
	g_cancellable_cancel(src->cancellable);
	g_mutex_unlock(&src->lock);
	return TRUE;
}

static gboolean og_media_src_unlock_stop(GstBaseSrc *base)
{
	OgMediaSrc *src = (OgMediaSrc *)base;
	g_mutex_lock(&src->lock);
	g_object_unref(src->cancellable);
	src->cancellable = g_cancellable_new();
	g_clear_object(&src->stream);
	g_mutex_unlock(&src->lock);
	return TRUE;
}

static void og_media_src_set_property(GObject *object, guint id, const GValue *value, GParamSpec *pspec)
{
	if (id == PROP_LOCATION)
		gst_uri_handler_set_uri(GST_URI_HANDLER(object), g_value_get_string(value), NULL);
	else
		G_OBJECT_WARN_INVALID_PROPERTY_ID(object, id, pspec);
}

static void og_media_src_get_property(GObject *object, guint id, GValue *value, GParamSpec *pspec)
{
	if (id == PROP_LOCATION)
		g_value_set_string(value, ((OgMediaSrc *)object)->uri);
	else
		G_OBJECT_WARN_INVALID_PROPERTY_ID(object, id, pspec);
}

static void og_media_src_finalize(GObject *object)
{
	OgMediaSrc *src = (OgMediaSrc *)object;
	g_clear_object(&src->stream);
	g_clear_object(&src->cancellable);
	g_free(src->uri);
	g_mutex_clear(&src->lock);
	G_OBJECT_CLASS(og_media_src_parent_class)->finalize(object);
}

static void og_media_src_init(OgMediaSrc *src)
{
	g_mutex_init(&src->lock);
	src->cancellable = g_cancellable_new();
	gst_base_src_set_format(GST_BASE_SRC(src), GST_FORMAT_BYTES);
	gst_base_src_set_async(GST_BASE_SRC(src), TRUE);
}

static void og_media_src_class_init(OgMediaSrcClass *klass)
{
	GObjectClass *object_class = G_OBJECT_CLASS(klass);
	GstElementClass *element_class = GST_ELEMENT_CLASS(klass);
	GstBaseSrcClass *base_class = GST_BASE_SRC_CLASS(klass);
	static GstStaticPadTemplate src_template = GST_STATIC_PAD_TEMPLATE("src", GST_PAD_SRC, GST_PAD_ALWAYS, GST_STATIC_CAPS_ANY);
	object_class->set_property = og_media_src_set_property;
	object_class->get_property = og_media_src_get_property;
	object_class->finalize = og_media_src_finalize;
	g_object_class_install_property(object_class, PROP_LOCATION,
		g_param_spec_string("location", "Location", "ogmedia URI", NULL, G_PARAM_READWRITE | G_PARAM_STATIC_STRINGS));
	gst_element_class_add_static_pad_template(element_class, &src_template);
	gst_element_class_set_static_metadata(element_class, "Open Grind media source", "Source/Network", "Reads ogmedia URIs from Open Grind", "Open Grind");
	base_class->create = og_media_src_create;
	base_class->get_size = og_media_src_get_size;
	base_class->is_seekable = og_media_src_is_seekable;
	base_class->query = og_media_src_query;
	base_class->start = og_media_src_start;
	base_class->stop = og_media_src_stop;
	base_class->unlock = og_media_src_unlock;
	base_class->unlock_stop = og_media_src_unlock_stop;
}

static GstURIType og_media_src_uri_get_type(GType type)
{
	return GST_URI_SRC;
}

static const gchar *const *og_media_src_uri_get_protocols(GType type)
{
	static const gchar *protocols[] = { "ogmedia", NULL };
	return protocols;
}

static gchar *og_media_src_uri_get_uri(GstURIHandler *handler)
{
	return g_strdup(((OgMediaSrc *)handler)->uri);
}

static gboolean og_media_src_uri_set_uri(GstURIHandler *handler, const gchar *uri, GError **error)
{
	OgMediaSrc *src = (OgMediaSrc *)handler;
	g_free(src->uri);
	src->uri = g_strdup(uri);
	return TRUE;
}

static void og_media_src_uri_handler_init(gpointer iface, gpointer data)
{
	GstURIHandlerInterface *handler = iface;
	handler->get_type = og_media_src_uri_get_type;
	handler->get_protocols = og_media_src_uri_get_protocols;
	handler->get_uri = og_media_src_uri_get_uri;
	handler->set_uri = og_media_src_uri_set_uri;
}

G_MODULE_EXPORT void webkit_web_extension_initialize(WebKitWebExtension *extension)
{
	web_extension = g_object_ref(extension);
	gst_init(NULL, NULL);
	gst_element_register(NULL, "ogmediasrc", GST_RANK_PRIMARY, og_media_src_get_type());
}
