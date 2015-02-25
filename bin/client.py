#!/usr/local/bin/python

import json
import re
import sys
import netifaces
import struct
import socket
from autobahn.twisted.websocket import WebSocketClientProtocol, \
    WebSocketClientFactory


deviceAddresses = {}

class DeviceClientProtocol(WebSocketClientProtocol):

    def onConnect(self, response):
        global deviceAddresses
        print("Server connected: {0}".format(response.peer))
        m = re.match('tcp[46]:([^:]+):.*', response.peer)
        if m:
            print m.group(1)
            self.ipaddr = m.group(1)
            print self.ipaddr
            deviceAddresses[self.ipaddr] = self.ipaddr
        print deviceAddresses

    def onOpen(self):
        global deviceAddresses
        print("WebSocket connection open.")
        # fetch device hostname.txt
        self.sendMessage('cat /mnt/sdcard/hostname.txt', False)

    def onMessage(self, payload, isBinary):
        global deviceAddresses
        if isBinary:
            print("Binary message received: {0} bytes".format(len(payload)))
        else:
            print("Text message received: {0}".format(payload.decode('utf8')))
        if not payload.startswith('<status>') and not payload.startswith('<err>'):
            lines = payload.split('\n')
            deviceAddresses[self.ipaddr] = lines[0]
        print deviceAddresses
        self.sendClose()

    def onClose(self, wasClean, code, reason):
        print("WebSocket connection closed: {0}".format(reason))

class ShellClientProtocol(WebSocketClientProtocol):

    def onConnect(self, response):
        print("Server connected: {0}".format(response.peer))
        self.sendMessage(json.dumps(self.factory.info), False)

    def onOpen(self):
        global deviceAddresses
        print("WebSocket connection open.")

    def onMessage(self, payload, isBinary):
        if isBinary:
            print("Binary message received: {0} bytes".format(len(payload)))
        else:
            print("Text message received: {0}".format(payload.decode('utf8')))
        if payload.startswith('<status>') or payload.startswith('<err>'):
            return
        if hasattr(self.factory, 'callback'):
            print self.factory.callback
            self.factory.callback(payload)

    def onClose(self, wasClean, code, reason):
        print("WebSocket connection closed: {0}".format(reason))

def ip2int(addr):                                                               
    return struct.unpack("!I", socket.inet_aton(addr))[0]                       

def int2ip(addr):                                                               
    return socket.inet_ntoa(struct.pack("!I", addr))

def detect_network():
    global zedboards
    zedboards = []
    for ifc in netifaces.interfaces():
        ifaddrs = netifaces.ifaddresses(ifc)
        if netifaces.AF_INET in ifaddrs.keys():
            af_inet = ifaddrs[netifaces.AF_INET]
            for i in af_inet: 
                if i.get('addr') == '127.0.0.1':
                    print 'skipping localhost'
                else:
                    addr = ip2int(i.get('addr'))
                    netmask = ip2int(i.get('netmask'))
                    start = addr & netmask
                    end = start + (netmask ^ 0xffffffff) 
                    start = start+1
                    end = end-1
                    print (int2ip(start), int2ip(end)) 
                    return [int2ip(start+i) for i in xrange(1, (netmask ^ 0xffffffff))]

def runpatch(patch):
    print 'running patch'
    print patch
    factory = WebSocketClientFactory("ws://%s:7682/ws" % addr, debug=options.debug, protocols=['shell'])
    factory.info = {
        'cmd': 'build.py',
        'repo': 'git://github.com/zedblue/leds',
        'dir': '',
        'username': 'jameyhicks2',
        'branch': 'master',
        'boardname': 'zedboard',
        'listfiles': 0,
        'update': 0,
        'patch': patch
        }
    factory.protocol = ShellClientProtocol
    reactor.connectTCP(addr, 7682, factory)


if __name__ == '__main__':

    import argparse
    argparser = argparse.ArgumentParser('Build server')
    argparser.add_argument('-d', '--debug', help='Enable debug log', default=False, action='store_true')
    argparser.add_argument('-p', '--probe', help='Probe for devices', default=False, action='store_true') 
    argparser.add_argument('--gitdiff', help='Git diff', default=False, action='store_true') 
    argparser.add_argument('--irclog', help='Log builds to irc.freenode.net', default=False, action='store_true')

    options = argparser.parse_args()

    import sys

    from twisted.python import log
    from twisted.internet import reactor

    #log.startLogging(sys.stdout)

    if options.probe:
        addrs = detect_network()
        addrs = ['192.168.214.116']
        for addr in addrs:
            factory = WebSocketClientFactory("ws://%s:7682/ws" % addr, debug=options.debug, protocols=[])
            factory.protocol = DeviceClientProtocol

            reactor.connectTCP(addr, 7682, factory)

    if options.gitdiff:
        addr = '127.0.0.1'
        factory = WebSocketClientFactory("ws://%s:7682/ws" % addr, debug=options.debug, protocols=['shell'])
        factory.info = {
            'cmd': 'clone.py',
            'repo': 'git://github.com/zedblue/leds',
            'dir': '',
            'username': 'jameyhicks',
            'branch': 'master',
            'boardname': 'zedboard',
            'listfiles': 0,
            'update': 1,
            'gitdiff': 1
            }
        factory.protocol = ShellClientProtocol
        factory.callback = runpatch

        reactor.connectTCP(addr, 7682, factory)

    reactor.run()
