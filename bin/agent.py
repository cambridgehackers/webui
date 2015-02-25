#!/usr/bin/python
###############################################################################
##
##  Copyright (C) 2011-2013 Tavendo GmbH
##
##  Licensed under the Apache License, Version 2.0 (the "License");
##  you may not use this file except in compliance with the License.
##  You may obtain a copy of the License at
##
##      http://www.apache.org/licenses/LICENSE-2.0
##
##  Unless required by applicable law or agreed to in writing, software
##  distributed under the License is distributed on an "AS IS" BASIS,
##  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
##  See the License for the specific language governing permissions and
##  limitations under the License.
##
###############################################################################

import os
import sys
import json
import irc
import argparse

import client

irclog = None

import twisted
from twisted.internet import reactor
from twisted.python import log
from twisted.web.server import Site
from twisted.web.static import File

from autobahn.twisted.websocket import WebSocketClientProtocol, WebSocketClientFactory
from autobahn.twisted.websocket import WebSocketServerFactory, WebSocketServerProtocol
from autobahn.twisted.resource import WebSocketResource, HTTPChannelHixie76Aware

from twisted.internet import protocol
class WSProcessProtocol(protocol.ProcessProtocol):
    def __init__(self, ssp, isBinary, closeStdin):
        self.ssp = ssp
        self.isBinary = isBinary
        self.closeStdin = closeStdin
        self.active = True
        def heartbeat(self):
            if self.active:
                self.ssp.sendMessage("<hb>")
                reactor.callLater(20, heartbeat, self)
        reactor.callLater(20, heartbeat, self)

    def connectionMade(self):
        if self.closeStdin:
            self.transport.closeStdin()
    def inReceived(self, data):
        self.transport.write(data)
    def outReceived(self, data):
        self.ssp.sendMessage(data, self.isBinary)
    def errReceived(self, data):
        print '<err>'+data
        self.ssp.sendMessage('<err>'+data, self.isBinary)
    def processExited(self, status):
        try:
            self.ssp.sendMessage('<status>%d' % status.value.exitCode, self.isBinary)
        except:
            self.ssp.sendMessage('<status>%s' % status.value, self.isBinary)
        print 'processExited', status
        self.ssp.sendClose()
        self.active = False

class ShellServerProtocol(WebSocketServerProtocol):

   def onConnect(self, request):
      print("WebSocket connection request: {}".format(request))
      print('  protocols', self.websocket_protocols)
      self.cmd = None
      self.f = None
      self.process = None
      if not self.websocket_protocols:
          print 'no protocols'
          return
      protocol = self.websocket_protocols[0]
      if protocol == 'push' or protocol == 'pull':
          try:
              filename = request.path
              filename = filename[4:]
              print 'filename', filename
              if protocol == 'push':
                  self.f = open(filename, 'w')
                  print self.f, 'w'
              else:
                  self.f = open(filename, 'r')
                  self.t = self.f.read()
                  print self.t
                  def later(self):
                      self.sendMessage(self.t)
                      print 'ShellServerProtocol.later, closing'
                      self.sendClose()
                  reactor.callLater(1, later, self)
          except:
              print 'error in push or pull'
              pass
      if protocol == 'devices':
          print('onConnect.devices', client.deviceAddresses)
          print('onConnect.devices', json.dumps(client.deviceAddresses))
          def later(self):
              self.sendMessage(json.dumps(client.deviceAddresses), False)
              print ('sent devices list')
              self.sendClose()
          reactor.callLater(1, later, self)
      return (self.websocket_protocols[0],)

   def onMessage(self, payload, isBinary):
       if not self.websocket_protocols:
           print 'onMessage', payload
           return
       protocol = self.websocket_protocols[0]
       if protocol == 'shell':
           self.wspp = WSProcessProtocol(self, isBinary, True)
           usePTY=True
           env = os.environ
           env['PATH'] = env['PATH'] + ':bin'
           env['LM_LICENSE_FILE'] = '27000@localhost'
           if payload.startswith('{'):
               info = json.loads(payload)
               cmd = info['cmd']
               self.cmd = cmd
               if irclog:
                   try:
                       msg = '%(cmd)s %(username)s %(repo)s %(boardname)s' % info
                       msg = msg.encode('ascii')
                       print type(msg), msg
                       irclog.sendMsg(msg)
                   except:
                       pass
               self.process = reactor.spawnProcess(self.wspp, cmd, args=[cmd, payload], env=env)
           else:
               self.cmd = payload
               self.process = reactor.spawnProcess(self.wspp, '/bin/sh', args=['sh', '-c', payload], env=env)
           print 'spawned process %s' % self.cmd
           print '        process args %s' % payload
       elif protocol == 'push':
           self.f.write(payload)
       else:
           pass

   def onClose(self, wasClean, code, reason):
       print 'onClose', wasClean, code, reason
       if self.process:
           try:
               print 'sending SIGTERM to process %s' % self.cmd
               self.process.signalProcess("TERM")
               print 'terminated process %s' % self.cmd
           except twisted.internet.error.ProcessExitedAlready:
               pass
       if self.f:
           self.f.close()

def probeAddrs(addrs):
    limit = 100
    if len(addrs) > limit:
        rest = addrs[limit:]
        addrs = addrs[0:limit]
        reactor.callLater(10,probeAddrs,rest)
    for addr in addrs:
        print 'probing addr', addr
        factory = WebSocketClientFactory("ws://%s:7682/ws" % addr, debug=False, protocols=['shell'])
        factory.protocol = client.DeviceClientProtocol
        reactor.connectTCP(addr, 7682, factory)

if __name__ == '__main__':

   argparser = argparse.ArgumentParser('Build server')
   argparser.add_argument('-d', '--debug', help='Enable debug log', default=False, action='store_true')
   argparser.add_argument('-p', '--probe', help='Probe for devices', default=False, action='store_true') 
   argparser.add_argument('--irclog', help='Log builds to irc.freenode.net', default=False, action='store_true')

   options = argparser.parse_args()
   if options.debug:
      log.startLogging(sys.stdout)
      debug = True
   else:
      debug = False

   if options.irclog:
       irclog = irc.LogBotFactory('#asic-builds', 'irclog.txt')
       reactor.connectTCP("irc.freenode.net", 6667, irclog)

   factory = WebSocketServerFactory("ws://localhost:7682/",
                                    debug = debug,
                                    debugCodePaths = debug)

   factory.protocol = ShellServerProtocol
   factory.setProtocolOptions(allowHixie76 = True) # needed if Hixie76 is to be supported

   resource = WebSocketResource(factory)

   ## we server static files under "/" ..
   root = File(".")

   ## and our WebSocket server under "/ws"
   root.putChild("ws", resource)

   ## both under one Twisted Web Site
   site = Site(root)
   site.protocol = HTTPChannelHixie76Aware # needed if Hixie76 is to be supported
   reactor.listenTCP(7682, site)

   if options.probe:
       addrs = client.detect_network()
       print len(addrs)
       reactor.callLater(1, probeAddrs, addrs)

   print os.environ
   reactor.run()
