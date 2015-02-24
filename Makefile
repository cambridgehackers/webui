
LIBWEBSOCKETS_DIR=../libwebsockets
LIBWEBSOCKETS_LIB_DIR=$(LIBWEBSOCKETS_DIR)/lib
LIBWEBSOCKETS_BUILD_DIR=$(LIBWEBSOCKETS_DIR)/build

CFLAGS = -O -g -I$(LIBWEBSOCKETS_LIB_DIR) -I$(LIBWEBSOCKETS_BUILD_DIR) 

LDFLAGS = -L$(LIBWEBSOCKETS_BUILD_DIR)/lib -lwebsockets

all:

config:
	sed -i.001 -e "s/54.86.72.185/`bin/getpublicip.py`/" js/zdb.js
	sed -i.001 -e "s/\/path\/to\/webui/$(subst /,\\/,$(PWD))/" nginx/proxy

agent: ace
	easy_install autobahn

runagent: agent
	nohup ./bin/agent.py > agent.log 2> agent.errlog &

ace:
	git clone git://github.com/ajaxorg/ace
	git clone git://github.com/ajaxorg/ace-builds

$(LIBWEBSOCKETS_DIR):
	cd ..; git clone git://git.libwebsockets.org/libwebsockets

$(LIBWEBSOCKETS_BUILD_DIR): $(LIBWEBSOCKETS_DIR)
	cd $(LIBWEBSOCKETS_DIR); mkdir -p build; cd build; cmake ..

$(LIBWEBSOCKETS_LIB_DIR)/libwebsockets.so: $(LIBWEBSOCKETS_BUILD_DIR)
	cd $(LIBWEBSOCKETS_BUILD_DIR); make

bin/zedboard-server: src/zedboard-server.c $(LIBWEBSOCKETS_DIR) $(LIBWEBSOCKETS_LIB_DIR)/libwebsockets.so
	mkdir -p bin
	gcc $(CFLAGS) -o bin/zedboard-server src/zedboard-server.c $(LDFLAGS)

run-zedboard-server: bin/zedboard-server
	LD_LIBRARY_PATH=$(LIBWEBSOCKETS_BUILD_DIR)/lib ./bin/zedboard-server
