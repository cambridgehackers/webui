
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
#include <sys/wait.h>
#include <fcntl.h>
#ifdef ANDROID
#define F_SETPIPE_SZ (F_LINUX_SPECIFIC_BASE + 7)
#define F_GETPIPE_SZ (F_LINUX_SPECIFIC_BASE + 8)
#endif
#include <unistd.h>
#include <errno.h>
#include <poll.h>
#ifdef ANDROID
#include <android/log.h>
#endif

#ifdef CMAKE_BUILD
#include "lws_config.h"
#endif

//#define USE_POPEN
// otherwise use fork/exec/pipe/poll

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

struct subprocess {
  int input;
  int output;
  int error;
  int pid;
  int exitCode;
  int statusSent;
};

#ifndef USE_POPEN
int forkSubprocess(struct subprocess *sp, char * const argv[])
{
  int inputPipeFd[2];
  int outputPipeFd[2];
  int errorPipeFd[2];
  int status;
  memset(sp, 0, sizeof(*sp));
  status = pipe(inputPipeFd);
  status = pipe(outputPipeFd);
  status = pipe(errorPipeFd);
  sp->pid = fork();

  // try to improve responsiveness of the shell
  fcntl(outputPipeFd[1], F_SETPIPE_SZ, 4096);
  fcntl(errorPipeFd[1], F_SETPIPE_SZ, 4096);

  if (sp->pid == 0) {
    // child process
    close(inputPipeFd[1]);
    close(outputPipeFd[0]);
    close(errorPipeFd[0]);

    dup2(inputPipeFd[0], 0);
    dup2(outputPipeFd[1], 1);
    dup2(errorPipeFd[1], 2);

#ifdef ANDROID
    __android_log_print(ANDROID_LOG_INFO, "websocket", "[%s:%d] cmd=%s %s %s input=%d output=%d error=%d\n", __FUNCTION__, __LINE__, argv[0], argv[1], argv[2],
			inputPipeFd[0], outputPipeFd[1], errorPipeFd[1]);
#endif

    status = execvp(argv[0], argv);
    if (status == -1)
      fprintf(stderr, "Error running %s: %s\n", argv[0], strerror(errno));

#ifdef ANDROID
    __android_log_print(ANDROID_LOG_INFO, "websocket", "[%s:%d] cmd=%s pid=%d errno=%d status=%d\n", __FUNCTION__, __LINE__, argv[0], sp->pid, errno, status);
#endif

  } else {
    close(inputPipeFd[0]);
    close(outputPipeFd[1]);
    close(errorPipeFd[1]);
    sp->input = inputPipeFd[1];
    sp->output = outputPipeFd[0];
    sp->error = errorPipeFd[0];
  }
  return 0;
}
#endif

struct per_session_data__zedboard {
    unsigned char buf[LWS_SEND_BUFFER_PRE_PADDING + MAX_ZEDBOARD_PAYLOAD + LWS_SEND_BUFFER_POST_PADDING];
    unsigned int fd;
    size_t len;
    unsigned int index;
    FILE *pipe;
    struct subprocess subprocess;
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
	//fprintf(stderr, "pull server writeable\n");
	while (1) {
	  if (pss->len == 0 && pss->fd) {
	    pss->len = read(pss->fd, &pss->buf[LWS_SEND_BUFFER_PRE_PADDING], MAX_ZEDBOARD_PAYLOAD);
	  }
	  //fprintf(stderr, "    now pss->len=%d\n", pss->len);

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
	  //fprintf(stderr, "   wrote %d pss->len = %ld\n", n, pss->len);

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
	break;

    case LWS_CALLBACK_CLOSED:
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
	char uri[256];
	lws_hdr_copy(wsi, uri, sizeof(uri), WSI_TOKEN_GET_URI);
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
	break;

    case LWS_CALLBACK_CLOSED:
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
    int n = 0;
    switch (reason) {
    case LWS_CALLBACK_SERVER_WRITEABLE:

#ifndef USE_POPEN
      if (pss->len == 0 && pss->subprocess.statusSent) {
#ifdef ANDROID
	  __android_log_print(ANDROID_LOG_INFO, "websocket", "[%s:%d] ending connection\n", __FUNCTION__, __LINE__);
#endif
	  return 1;
      }
#endif

	while (1) {
	  if (pss->len == 0) {
	    pid_t pid = waitpid(pss->subprocess.pid, &pss->subprocess.exitCode, WNOHANG);
	    if (pid && pid != -1) {
#ifdef ANDROID
	      __android_log_print(ANDROID_LOG_INFO, "websocket", "[%s:%d] subprocess exited pid=%d exitCode=%d\n", __FUNCTION__, __LINE__, pid, pss->subprocess.exitCode);
#endif
	      pss->len = snprintf(&pss->buf[LWS_SEND_BUFFER_PRE_PADDING], MAX_ZEDBOARD_PAYLOAD, "<status>%d\n", pss->subprocess.exitCode);
	      pss->subprocess.statusSent = 1;
	    }
	  }

#ifdef USE_POPEN
	  if (pss->len == 0 && pss->pipe) {
	    pss->len = fread(&pss->buf[LWS_SEND_BUFFER_PRE_PADDING], 1, MAX_ZEDBOARD_PAYLOAD, pss->pipe);
	  }
#else
	  if (pss->len == 0 && pss->subprocess.pid) {
	    struct pollfd pollfd[2];
	    memset(pollfd, 0, sizeof(pollfd));
	    pollfd[0].fd = pss->subprocess.output;
	    pollfd[0].events = POLLIN;
	    pollfd[1].fd = pss->subprocess.error;
	    pollfd[1].events = POLLIN;
	    int status = poll(pollfd, 2, 0);
#ifdef ANDROID
	    if (status)
	      __android_log_print(ANDROID_LOG_INFO, "websocket", "[%s:%d] poll status=%d errno=%d\n", __FUNCTION__, __LINE__, status, (status < 0 ? errno : 0));
#endif
	    if (status > 0) {
	      int i;
	      // give preference to stderr
	      for (i = 1; i >= 0; i--) {
		if (pollfd[i].revents & POLLIN) {
		  int offset = 0;
		  memset(&pss->buf[LWS_SEND_BUFFER_PRE_PADDING], 0, MAX_ZEDBOARD_PAYLOAD);
		  if (i == 1) {
		    offset = 5;
		    strncpy(&pss->buf[LWS_SEND_BUFFER_PRE_PADDING], "<err>", offset);
		  }
		  pss->len = read(pollfd[i].fd, &pss->buf[LWS_SEND_BUFFER_PRE_PADDING+offset], MAX_ZEDBOARD_PAYLOAD-offset);
		  pss->len += offset;
		  break;
		}
	      }
	    }
	  }
#endif

	  if (pss->len)
	    n = libwebsocket_write(wsi, &pss->buf[LWS_SEND_BUFFER_PRE_PADDING], pss->len, LWS_WRITE_TEXT);
	  else {
	    libwebsocket_callback_on_writable(context, wsi);
	    return 0;
	  }
	  if (n < 0) {
	    lwsl_err("ERROR %d writing to socket, hanging up\n", n);
#ifdef ANDROID
	  __android_log_print(ANDROID_LOG_INFO, "websocket", "[%s:%d] error writing to socket\n", __FUNCTION__, __LINE__);
#endif
	    return 1;
	  }
	  if (n < (int)pss->len) {
	    lwsl_err("Partial write\n");
#ifdef ANDROID
	  __android_log_print(ANDROID_LOG_INFO, "websocket", "[%s:%d] partial write\n", __FUNCTION__, __LINE__);
#endif
	    return -1;
	  }
	  pss->len -= n;
	  fprintf(stderr, "   wrote %d pss->len = %ld\n", n, pss->len);
#ifdef ANDROID
	  __android_log_print(ANDROID_LOG_INFO, "websocket", "[%s:%d] wrote %s\n", __FUNCTION__, __LINE__, &pss->buf[LWS_SEND_BUFFER_PRE_PADDING]);
	  __android_log_print(ANDROID_LOG_INFO, "websocket", "[%s:%d] wrote %d pss->len=%d\n", __FUNCTION__, __LINE__, n, pss->len);
#endif

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
#ifdef USE_POPEN
	pss->pipe = popen((const char *)&pss->buf[LWS_SEND_BUFFER_PRE_PADDING], "r");
	if (pss->pipe == 0)
	    fprintf(stderr, "Failed to open pipe %d:%s\n", errno, strerror(errno));
#else
	char * const argv[] = { "sh", "-c", (char *)in, NULL };
	forkSubprocess(&pss->subprocess, argv);
#endif
	pss->len = 0;
	libwebsocket_callback_on_writable(context, wsi);
	break;

    case LWS_CALLBACK_ESTABLISHED: {
#ifdef ANDROID
	  __android_log_print(ANDROID_LOG_INFO, "websocket", "[%s:%d] shell connection established\n", __FUNCTION__, __LINE__);
#endif
	break;
    }
    case LWS_CALLBACK_CLOSED:
	fprintf(stderr, "shell connection closed\n");
	if (pss->pipe != 0) {
	    pclose(pss->pipe);
	    pss->pipe = 0;
	}
	if (pss->subprocess.pid) {
#ifdef ANDROID
	  __android_log_print(ANDROID_LOG_INFO, "websocket", "[%s:%d] closing pid %d\n", __FUNCTION__, __LINE__, pss->subprocess.pid);
#endif
	  kill(SIGTERM, pss->subprocess.pid);
	  close(pss->subprocess.input);
	  close(pss->subprocess.output);
	  close(pss->subprocess.error);
	  waitpid(pss->subprocess.pid, &pss->subprocess.exitCode, 0);
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
