
LIBWEBSOCKETS_DIR=../libwebsockets
LIBWEBSOCKETS_LIB_DIR=$(LIBWEBSOCKETS_DIR)/lib
LIBWEBSOCKETS_BUILD_DIR=$(LIBWEBSOCKETS_DIR)/build

CFLAGS = -O -g -I$(LIBWEBSOCKETS_LIB_DIR) -I$(LIBWEBSOCKETS_BUILD_DIR) 

LDFLAGS = -L$(LIBWEBSOCKETS_BUILD_DIR)/lib -lwebsockets

$(LIBWEBSOCKETS_DIR):
	cd ..; git clone git://git.libwebsockets.org/libwebsockets

$(LIBWEBSOCKETS_BUILD_DIR): $(LIBWEBSOCKETS_DIR)
	cd $(LIBWEBSOCKETS_DIR); mkdir -p build; cd build; cmake ..

$(LIBWEBSOCKETS_LIB_DIR)/libwebsockets.so: $(LIBWEBSOCKETS_BUILD_DIR)
	cd $(LIBWEBSOCKETS_BUILD_DIR); make

bin/zedboard-server: src/zedboard-server.c $(LIBWEBSOCKETS_DIR) $(LIBWEBSOCKETS_LIB_DIR)/libwebsockets.so
	mkdir -p bin
	gcc $(CFLAGS) -o bin/zedboard-server src/zedboard-server.c $(LDFLAGS)

run: bin/zedboard-server
	LD_LIBRARY_PATH=$(LIBWEBSOCKETS_BUILD_DIR)/lib ./bin/zedboard-server