
LIBWEBSOCKETS_DIR=../libwebsockets
LIBWEBSOCKETS_LIB_DIR=$(LIBWEBSOCKETS_DIR)/lib
LIBWEBSOCKETS_BUILD_DIR=$(LIBWEBSOCKETS_DIR)/build

CFLAGS = -O -g -I$(LIBWEBSOCKETS_LIB_DIR) -I$(LIBWEBSOCKETS_BUILD_DIR) 

LDFLAGS = -L$(LIBWEBSOCKETS_BUILD_DIR)/lib -lwebsockets

help:
	echo 'make config to update build server IP in scripts'
	echo 'make runagent to run the build server agent'
	echo 'make rundesktop to run the desktop agent'
	echo 'make zynqagent to build the zynq device agent'

config:
	sed -i.001 -e "s/54.86.72.185/`bin/getpublicip.py`/" js/zdb.js
	sed -i.001 -e "s/\/path\/to\/webui/$(subst /,\\/,$(PWD))/" nginx/proxy

agent: ace
	easy_install autobahn
	easy_install netifaces

runagent: agent
	nohup ./bin/agent.py > agent.log 2> agent.errlog &

rundesktop: agent
	#./bin/agent.py --probe > agent.log 2> agent.errlog &
	./bin/agent.py --probe

ace:
	git clone git://github.com/ajaxorg/ace
	git clone git://github.com/ajaxorg/ace-builds

$(LIBWEBSOCKETS_DIR):
	cd ..; git clone git://git.libwebsockets.org/libwebsockets

$(LIBWEBSOCKETS_BUILD_DIR): $(LIBWEBSOCKETS_DIR)
	cd $(LIBWEBSOCKETS_DIR); mkdir -p build; cd build; cmake ..

$(LIBWEBSOCKETS_LIB_DIR)/libwebsockets.so: $(LIBWEBSOCKETS_BUILD_DIR)
	cd $(LIBWEBSOCKETS_BUILD_DIR); make

## build the device agent for ubuntu
bin/zedboard-server: src/zedboard-server.c $(LIBWEBSOCKETS_DIR) $(LIBWEBSOCKETS_LIB_DIR)/libwebsockets.so
	mkdir -p bin
	gcc $(CFLAGS) -o bin/zedboard-server src/zedboard-server.c $(LDFLAGS)

## run the device agent for ubuntu
run-zedboard-server: bin/zedboard-server
	LD_LIBRARY_PATH=$(LIBWEBSOCKETS_BUILD_DIR)/lib ./bin/zedboard-server

zynqagent:
	ndk-build
