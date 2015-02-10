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

from twisted.internet import reactor
from twisted.python import log
from twisted.web.server import Site
from twisted.web.static import File

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
        self.ssp.sendMessage('<status>%d' % status.value.exitCode, self.isBinary)
        print 'processExited', status
        self.ssp.sendClose()
        self.active = False

class ShellServerProtocol(WebSocketServerProtocol):

   def onConnect(self, request):
      print("WebSocket connection request: {}".format(request))
      self.cmd = None
      self.f = None
      protocol = self.websocket_protocols[0]
      if protocol == 'push' or protocol == 'pull':
          filename = request.path
          filename = filename[4:]
          print filename
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

      return (self.websocket_protocols[0],)

   def onMessage(self, payload, isBinary):
       protocol = self.websocket_protocols[0]
       if protocol == 'shell':
           self.wspp = WSProcessProtocol(self, isBinary, True)
           usePTY=True
           env = os.environ
           env['PATH'] = env['PATH'] + ':bin'
           env['LM_LICENSE_FILE'] = '27000@localhost'
           reactor.spawnProcess(self.wspp, '/bin/sh', args=['sh', '-c', payload], env=env)
       elif protocol == 'push':
           self.f.write(payload)
       else:
           pass

   def onCloseFoo(self, wasClean, code, reason):
       print 'onClose', wasClean, code, reason
       if self.f:
           self.f.close()

if __name__ == '__main__':

   if len(sys.argv) > 1 and sys.argv[1] == 'debug':
      log.startLogging(sys.stdout)
      debug = True
   else:
      debug = False

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

   print os.environ
   reactor.run()
