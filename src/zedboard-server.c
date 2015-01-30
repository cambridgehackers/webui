#include <stdio.h>
#include <stdlib.h>
#include <getopt.h>
#include <string.h>
#include <assert.h>
#include <signal.h>
#include <syslog.h>
#include <sys/time.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>

#ifdef CMAKE_BUILD
#include "lws_config.h"
#endif

#include "../lib/libwebsockets.h"

#define MAX_ZEDBOARD_PAYLOAD 256

int prefixlen=4;

const char * get_mimetype(const char *file)
{
	int n = strlen(file);

	if (n < 5)
		return NULL;

	if (!strcmp(&file[n - 4], ".ico"))
		return "image/x-icon";

	if (!strcmp(&file[n - 4], ".png"))
		return "image/png";

	if (!strcmp(&file[n - 5], ".html"))
		return "text/html";

	if (!strcmp(&file[n - 3], ".js"))
		return "application/javascript";

	return "text/plain";
}

struct per_session_data__zedboard {
    unsigned char buf[LWS_SEND_BUFFER_PRE_PADDING + MAX_ZEDBOARD_PAYLOAD + LWS_SEND_BUFFER_POST_PADDING];
    unsigned int fd;
    size_t len;
    unsigned int index;
    FILE *pipe;
};

static int
callback_zedboard(struct libwebsocket_context *context,
		  struct libwebsocket *wsi,
		  enum libwebsocket_callback_reasons reason, void *user, void *in, size_t len)
{
  //struct per_session_data__zedboard *pss = (struct per_session_data__zedboard *)user;
    int n;
	
    switch (reason) {
    case LWS_CALLBACK_HTTP: {
      char *buf = (char *)in+prefixlen;
      char *other_headers = 0;
      const char *mimetype = get_mimetype(in);
      int other_headers_len = 0;

      n = libwebsockets_serve_http_file(context, wsi, buf, mimetype, other_headers, other_headers_len);
      if (n < 0 || ((n > 0) && lws_http_transaction_completed(wsi)))
	return -1; /* error or can't reuse connection: close the socket */
    } break;

    default:
	break;
    }

    return 0;
}

static int
callback_pull(struct libwebsocket_context *context,
		  struct libwebsocket *wsi,
		  enum libwebsocket_callback_reasons reason, void *user, void *in, size_t len)
{
    struct per_session_data__zedboard *pss = (struct per_session_data__zedboard *)user;
    int n;
	
    switch (reason) {
    case LWS_CALLBACK_FILTER_PROTOCOL_CONNECTION: {
	//int urilen = lws_hdr_total_length(wsi, WSI_TOKEN_GET_URI);
	char uri[256];
	lws_hdr_copy(wsi, uri, sizeof(uri), WSI_TOKEN_GET_URI);
	pss->fd = open(uri+prefixlen, O_RDONLY);
	pss->len = 0;
	fprintf(stderr, "pull uri %s fd=%d\n", uri, pss->fd);
	libwebsocket_callback_on_writable(context, wsi);
    } break;

    case LWS_CALLBACK_SERVER_WRITEABLE: {
	fprintf(stderr, "pull server writeable\n");
	while (1) {
	  if (pss->len == 0 && pss->fd) {
	    pss->len = read(pss->fd, &pss->buf[LWS_SEND_BUFFER_PRE_PADDING], MAX_ZEDBOARD_PAYLOAD);
	  }
	  fprintf(stderr, "    now pss->len=%ld\n", pss->len);

	  if (pss->len)
	    n = libwebsocket_write(wsi, &pss->buf[LWS_SEND_BUFFER_PRE_PADDING], pss->len, LWS_WRITE_TEXT);
	  else
	    return -1;
	  if (n < 0) {
	    lwsl_err("ERROR %d writing to socket, hanging up\n", n);
	    return 1;
	  }
	  if (n < (int)pss->len) {
	    lwsl_err("Partial write\n");
	    return -1;
	  }
	  pss->len -= n;
	  fprintf(stderr, "   wrote %d pss->len = %ld\n", n, pss->len);

	  if (lws_partial_buffered(wsi) || lws_send_pipe_choked(wsi)) {
	    fprintf(stderr, "calling libwebsocket_callback_on_writable\n");
	    libwebsocket_callback_on_writable(context, wsi);
	    break;
	  }
	  /*
	   * for tests with chrome on same machine as client and
	   * server, this is needed to stop chrome choking
	   */
	  usleep(1);
	}
    } break;

    case LWS_CALLBACK_RECEIVE:
	if (len > MAX_ZEDBOARD_PAYLOAD) {
	    lwsl_err("Server received packet bigger than %u, hanging up\n", MAX_ZEDBOARD_PAYLOAD);
	    return 1;
	}
	fprintf(stderr, "pull %s\n", (char *)in);
	break;

    case LWS_CALLBACK_ESTABLISHED:
	fprintf(stderr, "pull connection established\n");
	break;

    case LWS_CALLBACK_CLOSED:
	fprintf(stderr, "pull connection closed\n");
	if (pss->fd >= 0) {
	    close(pss->fd);
	    pss->fd = -1;
	}
	break;

    default:
	break;
    }

    return 0;
}

static int
callback_push(struct libwebsocket_context *context,
		  struct libwebsocket *wsi,
		  enum libwebsocket_callback_reasons reason, void *user, void *in, size_t len)
{
    struct per_session_data__zedboard *pss = (struct per_session_data__zedboard *)user;
	
    switch (reason) {
    case LWS_CALLBACK_FILTER_PROTOCOL_CONNECTION: {
	int urilen = lws_hdr_total_length(wsi, WSI_TOKEN_GET_URI);
	fprintf(stderr, "uri hdr len %d\n", urilen);
	char uri[256];
	lws_hdr_copy(wsi, uri, sizeof(uri), WSI_TOKEN_GET_URI);
	fprintf(stderr, "uri %s\n", uri);
	pss->fd = open(uri, O_WRONLY|O_CREAT, 0644);
    } break;

    case LWS_CALLBACK_RECEIVE:
	if (len > MAX_ZEDBOARD_PAYLOAD) {
	    lwsl_err("Server received packet bigger than %u, hanging up\n", MAX_ZEDBOARD_PAYLOAD);
	    return 1;
	}
	fprintf(stderr, "push %s\n", (char *)in);
	int numbytes = write(pss->fd, in, len);
	if (numbytes != len)
	    fprintf(stderr, "short write len=%ld numbytes=%d\n", len, numbytes);
	memcpy(&pss->buf[LWS_SEND_BUFFER_PRE_PADDING], in, len);
	pss->len = (unsigned int)len;
	libwebsocket_callback_on_writable(context, wsi);
	break;

    case LWS_CALLBACK_ESTABLISHED:
	fprintf(stderr, "push connection established\n");
	break;

    case LWS_CALLBACK_CLOSED:
	fprintf(stderr, "push connection closed\n");
	break;

    default:
	break;
    }

    return 0;
}

static int
callback_shell(struct libwebsocket_context *context,
		  struct libwebsocket *wsi,
		  enum libwebsocket_callback_reasons reason, void *user, void *in, size_t len)
{
    struct per_session_data__zedboard *pss = (struct per_session_data__zedboard *)user;
    int n;
	
    switch (reason) {
    case LWS_CALLBACK_SERVER_WRITEABLE:
	fprintf(stderr, "shell server writeable pss->len=%ld pipe=%p\n", pss->len, pss->pipe);

	while (1) {
	  if (pss->len == 0 && pss->pipe) {
	    pss->len = fread(&pss->buf[LWS_SEND_BUFFER_PRE_PADDING], 1, MAX_ZEDBOARD_PAYLOAD, pss->pipe);
	  }
	  fprintf(stderr, "    now pss->len=%ld\n", pss->len);

	  if (pss->len)
	    n = libwebsocket_write(wsi, &pss->buf[LWS_SEND_BUFFER_PRE_PADDING], pss->len, LWS_WRITE_TEXT);
	  else
	    return -1;
	  if (n < 0) {
	    lwsl_err("ERROR %d writing to socket, hanging up\n", n);
	    return 1;
	  }
	  if (n < (int)pss->len) {
	    lwsl_err("Partial write\n");
	    return -1;
	  }
	  pss->len -= n;
	  fprintf(stderr, "   wrote %d pss->len = %ld\n", n, pss->len);

	  if (lws_partial_buffered(wsi) || lws_send_pipe_choked(wsi)) {
	    fprintf(stderr, "calling libwebsocket_callback_on_writable\n");
	    libwebsocket_callback_on_writable(context, wsi);
	    break;
	  }
	  /*
	   * for tests with chrome on same machine as client and
	   * server, this is needed to stop chrome choking
	   */
	  usleep(1);
	}
	break;

    case LWS_CALLBACK_RECEIVE:
	if (len > MAX_ZEDBOARD_PAYLOAD) {
	    lwsl_err("Server received packet bigger than %u, hanging up\n", MAX_ZEDBOARD_PAYLOAD);
	    return 1;
	}
	fprintf(stderr, "shell %s\n", (char *)in);
	snprintf((char *)&pss->buf[LWS_SEND_BUFFER_PRE_PADDING], MAX_ZEDBOARD_PAYLOAD, "sh -c '%s'", (char *)in);
	pss->pipe = popen((const char *)&pss->buf[LWS_SEND_BUFFER_PRE_PADDING], "r");
	if (pss->pipe == 0)
	    fprintf(stderr, "Failed to open pipe %d:%s\n", errno, strerror(errno));
	pss->len = 0;
	libwebsocket_callback_on_writable(context, wsi);
	break;

    case LWS_CALLBACK_ESTABLISHED: {
	fprintf(stderr, "shell connection established\n");
	break;
    }
    case LWS_CALLBACK_CLOSED:
	fprintf(stderr, "shell connection closed\n");
	if (pss->pipe != 0) {
	    pclose(pss->pipe);
	    pss->pipe = 0;
	}
	break;

    default:
	break;
    }

    return 0;
}

static struct libwebsocket_protocols protocols[] = {
    /* first protocol must always be HTTP handler */

    {
	"signaling",		/* name */
	callback_zedboard,		/* callback */
	sizeof(struct per_session_data__zedboard)	/* per_session_data_size */
    },
    {
	"pull",		/* name */
	callback_pull,		/* callback */
	sizeof(struct per_session_data__zedboard)	/* per_session_data_size */
    },
    {
	"push",		/* name */
	callback_push,		/* callback */
	sizeof(struct per_session_data__zedboard)	/* per_session_data_size */
    },
    {
	"shell",		/* name */
	callback_shell,		/* callback */
	sizeof(struct per_session_data__zedboard)	/* per_session_data_size */
    },
    {
	NULL, NULL, 0		/* End of list */
    }
};

static volatile int force_exit = 0;
void sighandler(int sig)
{
	force_exit = 1;
}

static struct option options[] = {
    { "help",	no_argument,		NULL, 'h' },
    { NULL, 0, 0, 0 }
};

int main(int argc, char **argv)
{
    int n = 0;
    int port = 7682;
    //int use_ssl = 0;
    struct libwebsocket_context *context;
    //char interface_name[128] = "";
    const char *interface = NULL;
    //char ssl_cert[256] = LOCAL_RESOURCE_PATH"/libwebsockets-test-server.pem";
    //char ssl_key[256] = LOCAL_RESOURCE_PATH"/libwebsockets-test-server.key.pem";
#ifndef WIN32
    int syslog_options = LOG_PID | LOG_PERROR;
#endif
    //int client = 0;
    //int listen_port = 80;
    struct lws_context_creation_info info;
    //char passphrase[256];
    //char uri[256] = "/";
#ifndef LWS_NO_CLIENT
    //char address[256], ads_port[256 + 30];
    //int rate_us = 250000;
    //unsigned int oldus = 0;
    /* struct libwebsocket *wsi; */
    /* int disallow_selfsigned = 0; */
#endif

    int debug_level = LLL_ERR|LLL_WARN|LLL_NOTICE|LLL_INFO|LLL_CLIENT|LLL_LATENCY;
#ifndef LWS_NO_DAEMONIZE
    //int daemonize = 0;
#endif

    memset(&info, 0, sizeof info);
#ifndef LWS_NO_CLIENT
    lwsl_notice("Built to support client operations\n");
#endif
#ifndef LWS_NO_SERVER
    lwsl_notice("Built to support server operations\n");
#endif

    /* we will only try to log things according to our debug_level */
    setlogmask(LOG_UPTO (LOG_DEBUG));
    openlog("lwsts", syslog_options, LOG_DAEMON);

    /* tell the library what debug level to emit and to send it to syslog */
    lws_set_log_level(debug_level, lwsl_emit_syslog);

    while (n >= 0 && !force_exit) {
	n = getopt_long(argc, argv, "i:hsp:d:DC:k:P:vu:"
#ifndef LWS_NO_CLIENT
			"c:r:"
#endif
			, options, NULL);
	if (n < 0)
	    continue;
	switch (n) {
	}
    }

    info.port = port;
    info.iface = interface;
    info.protocols = protocols;
    info.gid = -1;
    info.uid = -1;

    context = libwebsocket_create_context(&info);
    if (context == NULL) {
	lwsl_err("libwebsocket init failed\n");
	return -1;
    }

    signal(SIGINT, sighandler);

    n = 0;
    while (n >= 0 && !force_exit) {
	n = libwebsocket_service(context, 10);
    }
    libwebsocket_context_destroy(context);

    lwsl_notice("libwebsockets-test-echo exited cleanly\n");

#ifdef WIN32
#else
	closelog();
#endif

    return 0;
}
