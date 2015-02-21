#!/usr/local/bin/python

import re
import sys
import netifaces
import struct
import socket
from autobahn.twisted.websocket import WebSocketClientProtocol, \
    WebSocketClientFactory


deviceAddresses = []

class MyClientProtocol(WebSocketClientProtocol):

    def onConnect(self, response):
        print("Server connected: {0}".format(response.peer))
        m = re.match('tcp[46]:([^:]+):.*', response.peer)
        if m:
            deviceAddresses.append(m.group(1))
        print deviceAddresses
        self.sendClose()
        #self.factory.reactor.callLater(1, closeLater)

    def onOpen(self):
        global deviceAddresses
        print("WebSocket connection open.")

    def onMessage(self, payload, isBinary):
        if isBinary:
            print("Binary message received: {0} bytes".format(len(payload)))
        else:
            print("Text message received: {0}".format(payload.decode('utf8')))

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

if __name__ == '__main__':

    import sys

    from twisted.python import log
    from twisted.internet import reactor

    #log.startLogging(sys.stdout)

    addrs = detect_network()
    addrs = ['192.168.214.116']
    for addr in addrs:
        factory = WebSocketClientFactory("ws://%s:7682/ws" % addr, debug=False, protocols=[])
        factory.protocol = MyClientProtocol
        
        reactor.connectTCP(addr, 7682, factory)

    reactor.run()
