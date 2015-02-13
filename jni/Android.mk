# example Android Native Library makefile
# contributed by Gregory Junker <ggjunker@gmail.com>

LOCAL_PATH:= $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE := webserver
LOCAL_CFLAGS := -I/scratch/jamey/libwebsockets/lib
APP_SRC_FILES := ../src/zedboard-server.c
LOCAL_SRC_FILES := $(APP_SRC_FILES)
LOCAL_LDLIBS := -L/scratch/jamey/libwebsockets/obj/local/armeabi -lwebsockets -llog

include $(BUILD_EXECUTABLE)
