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
    def __init__(self, ssp, isBinary):
        self.ssp = ssp
        self.isBinary = isBinary
    def connectionMade(self):
        self.transport.closeStdin()
    def outReceived(self, data):
        print data
        self.ssp.sendMessage(data, self.isBinary)
    def errReceived(self, data):
        print '<err>'+data
        self.ssp.sendMessage('<err>'+data, self.isBinary)
    def processExited(self, status):
        self.ssp.sendMessage('<status>%d' % status.value.exitCode, self.isBinary)
        self.ssp.sendClose()

class ShellServerProtocol(WebSocketServerProtocol):

   def onConnect(self, request):
      print("WebSocket connection request: {}".format(request))
      return (self.websocket_protocols[0],)

   def onMessage(self, payload, isBinary):
       self.wspp = WSProcessProtocol(self, isBinary)
       uid = None
       gid = None
       usePTY=True
       childFDs = None
       env = os.environ
       env['PATH'] = env['PATH'] + ':bin'
       env['LM_LICENSE_FILE'] = '27000@localhost'
       reactor.spawnProcess(self.wspp, '/bin/sh', args=['sh', '-c', payload], env=env
                        )
       #env={'HOME': os.environ['HOME']}
       #path=os.environ['PATH'],
       #uid, gid, usePTY, childFDs)

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
