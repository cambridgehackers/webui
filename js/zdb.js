var Josh = Josh || {};
(function(root, $, _) {
  Josh.Zdb = (function(root, $, _) {
    // Enable console debugging, when Josh.Debug is set and there is a console object on the document root.
    var _console = (Josh.Debug && root.console) ? root.console : {
      log: function() {
      }
    };

      var $shellPanel;
      var $discoveryPanel;
      var $buildPanel;
      var wsUri = 'ws' + root.location.origin.slice(4) + '/ws/';
      var deviceUri;
      _console.log(wsUri);

      var itemTemplate = _.template('<% _.each(items, function(item, i) { %><div><%- item %></div><% }); %>');
      var errItemTemplate = _.template('<% _.each(items, function(item, i) { %><div><span class="input"><%- item %></span></div><% }); %>');
      var fooTemplate = _.template("<div><% _.each(items, function(item, i) { %><%- item %><<% }); %></div>");
      function writeToScreen(message, callback) {
	  _console.log('writeToScreen: ' + message);
	  _console.log('callback='+callback);
	  _console.log('itemTemplate='+itemTemplate({items: [message]}));
	  callback(itemTemplate({items: [message]}));
      }

      function runShellCommand(cmd, cb, uri) {
	  if (!uri)
	      uri = wsUri;
	  var callback = cb;
	  var result = "";
	  var websocket = new WebSocket(uri, 'shell');
	  websocket.onopen = function(evt) {
	      websocket.send(cmd);
	  };
	  websocket.onclose = function(evt) {
	      websocket.close();
	      var lines = result.split('\n');
	      callback(itemTemplate({items:lines}));
	  };
	  websocket.onmessage = function(evt) {
	      result = result + evt.data;
	  };
	  websocket.onerror = function(evt) {
	      writeToScreen('ERROR: ' + evt.data, callback);
	  }
      };
      function runStreamingShellCommand(cmd, cb, uri) {
	  if (!uri)
	      uri = wsUri;
	  _console.log('runStreamingShellCommand: ' + uri);
	  var callback = cb;
	  var websocket = new WebSocket(uri, 'shell');
	  var deferred = $.Deferred();
	  websocket.onopen = function(evt) {
	      websocket.send(cmd);
	  };
	  websocket.onclose = function(evt) {
	      websocket.close();
	      deferred.resolve();
	  };
	  websocket.onmessage = function(evt) {
	      var prefix = ''
	      var data = evt.data
	      if (data.indexOf('<err>') == 0) {
		  prefix = '<err>';
		  data = data.slice(5);
	      }
	      var lines = data.split('\n');
	      if (!prefix)
		  callback(itemTemplate({items:lines}));
	      else
		  callback(errItemTemplate({items:lines}));
	      deferred.notify(lines);
	  };
	  websocket.onerror = function(evt) {
	      writeToScreen('ERROR: ' + evt.data, callback);
	      deferred.reject();
	  }
	  return deferred;
      };
      function pullFile(file, cb, uri) {
	  if (!uri)
	      uri = wsUri;
	  var callback = cb;
	  var websocket = new WebSocket(uri + file, "pull");
	  var result = "";
	  websocket.onopen = function(evt) {
	      websocket.send(cmd);
	  };
	  websocket.onclose = function(evt) {
	      websocket.close();
	      var lines = result.split('\n');
	      callback(itemTemplate({items:lines}));
	  };
	  websocket.onmessage = function(evt) {
	      result = result + evt.data;
	  };
	  websocket.onerror = function(evt) {
	      writeToScreen('ERROR: ' + evt.data, callback);
	  }
      };

      function probeAddr(ipaddr, discoveryPanel, shellCallback) {
	  var uri = 'ws://' + ipaddr + '/ws/';
	  var websocket = new WebSocket(uri, 'shell');
	  websocket.onopen = function(evt) {
	      discoveryPanel.append('<div>Device: ' + ipaddr + '</div>');
	      _console.log('updating deviceUri=' + uri);
	      deviceUri = uri;
	      shellCallback(_.template('<div>Device uri <%- uri %></div>')({uri: uri}));
	      websocket.close();
	  }
	  websocket.onclose = function(evt) {
	      websocket = 0;
	  }
	  websocket.onerror = function(evt) {
	      websocket = 0;
	  }
      };

    function runDiscovery(shellCallback) {
	var i;
	var netaddrs = ['192.168.168.100', '192.168.1.100', '54.86.72.185', '172.17.1.200'];
	for (n in netaddrs) {
	    var netaddr = netaddrs[n].split('.');
	    var firstaddr = parseInt(netaddr[3]);
	    for (var i = 0; i < 10; i++) {
		netaddr[3] = i + firstaddr;
		console.log('Probing ' + netaddr);
		probeAddr(netaddr.join('.') + ':7682', $discoveryPanel, shellCallback);
	    }
	}
    };


      var activateConsolePanel = function() {
	  _console.log("activating shell");
	  shell.activate();
	  $shellPanel.slideDown();
	  $shellPanel.focus();
      };

      // Whenever we get either a `EOT` (`Ctrl-D` on empty line) or a `Cancel` (`Ctrl-C`) signal from the shell,
      // we deactivate the shell and hide the console.
      function hideAndDeactivate() {
          _console.log("deactivating shell");
          shell.deactivate();
          $shellPanel.slideUp();
          $shellPanel.blur();
      }

      var $repo;
      var $project;
      var $dir;
      var setProject = function(repourl, dir) {
	  _console.log('running repo ' + repourl + ' dir ' + dir);
	  function callback(text) {
	      $buildPanel.append(text);
	      $buildPanel.append('<br>');
	  }
	  $repo = repourl;
	  if (repourl.indexOf('/') >= 0) {
	      var parts = repourl.split('/');
	      _console.log('parts: ' + parts);
	      $project = parts[parts.length - 1];
	  } else {
	      $project = repourl;
	      $repo = 'git://github.com/cambridgehackers/' + repourl;
	  }
	  $dir = dir;
	  _console.log("$repo: " + $repo);
	  _console.log("$project: " + $project);
	  _console.log("$dir: " + $dir);
      };

      var runBuild = function(repourl, dir) {
	  if (repourl) {
	      setRepourl(repourl, dir);
	  } else {
	      repourl = $repo;
	      dir = $dir;
	  }	  
	  _console.log("running build " + repourl + ' dir ' + dir);
	  $buildPanel.empty();
	  $buildPanel.slideDown();
	  $buildPanel.focus();
	  function callback(text) {
	      $buildPanel.append(text);
	      $buildPanel.append('<br>');
	  }
	  cmd = 'build.py "' + repourl + '"';
	  if (dir)
	    cmd = cmd + ' "' + dir + '"';
	  runStreamingShellCommand(cmd, callback);
      };

      var displayBuildLines = function(lines) {
	  _console.log('displayBuildLines: ');
	  _console.log(lines);
	  for (var i in lines)
	      $buildPanel.append('<p>'+lines[i]+'</p>');
      }

      var runDevice = function(args) {
	  var cmds = ['cd /mnt/sdcard',
		      'rm -f android.exe mkTop.xdevcfg.bin.gz',
		      'wget http://54.86.72.185/ui/' + $project + '/' + $dir + '/zedboard/bin/android.exe',
		      'wget http://54.86.72.185/ui/' + $project + '/' + $dir + '/zedboard/bin/mkTop.xdevcfg.bin.gz',
		      'rmmod portalmem && insmod portalmem.ko',
		      'rmmod zynqportal && insmod zynqportal.ko',
		      'zcat mkTop.xdevcfg.bin.gz > /dev/xdevcfg && cat /dev/connectal && echo programmed',
		      'chmod agu+rx android.exe',
		      './android.exe 2>&1'
		     ];
	  var deferreds = [];
	  function chainCommands() {
	      if (cmds[0]) {
		  var cmd = cmds[0];
		  _console.log('chainCommands cmd='+cmd);
		  cmds = cmds.slice(1);
		  var d = runStreamingShellCommand(cmd, function (lines) {
		      _console.log(lines);
		  }, deviceUri);
		  d.progress(displayBuildLines);
		  d.done(chainCommands);
	      }
	  }
	  $buildPanel.empty();
	  $buildPanel.slideDown();
	  $buildPanel.focus();
	  chainCommands();
      };

    // Create `History` and `KillRing` by hand since we will use the `KillRing` for an example command.
    var history = Josh.History();
    var killring = new Josh.KillRing();

    // Create the `ReadLine` instance by hand so that we can provide it our `KillRing`. Since the shell needs to share
    // the `History` object with `ReadLine` and `Shell` isn't getting to create `ReadLine` automatically as it usually does
    // we need to pass in `History` into `ReadLine` as well.
    var readline = new Josh.ReadLine({history: history, killring: killring, console: _console });

    // Finally, create the `Shell`.
    var shell = Josh.Shell({readline: readline, history: history, console: _console});

      shell.setCommandHandler("shell", {
	  exec: function(cmd, args, callback) {
	      _console.log("shell cmd=" + cmd);
	      _console.log("shell args=" + args);
	      if (deviceUri)
		  runShellCommand(args.join(' '), callback, deviceUri);
	  }
      });
      shell.setCommandHandler("pull", {
	  exec: function(cmd, args, callback) {
	      _console.log("pull cmd=" + cmd);
	      _console.log("pull args=" + args);
	      if (args[0])
		  pullFile(args[0], callback);
	  }
      });
      shell.setCommandHandler("discover", {
	  exec: function(cmd, args, callback) {
	      _console.log("starting device discovery");
	      runDiscovery(callback);
	  }
      });
      shell.setCommandHandler("project", {
	  exec: function(cmd, args, callback) {
	      setProject(args[0], args[1]);
	      callback("");
	  }
      });
      shell.setCommandHandler("build", {
	  exec: function(cmd, args, callback) {
	      callback("");
	      hideAndDeactivate();
	      runBuild(args[0], args[1]);
	  }
      });
      shell.setCommandHandler("run", {
	  exec: function(cmd, args, callback) {
	      callback("");
	      hideAndDeactivate();
	      runDevice(args);
	  }
      });
      shell.setCommandHandler("exit", {
	  exec: function(cmd, args, callback) {
	      callback("");
	      hideAndDeactivate();
	  }
      });

    // Setup Document Behavior
    // -----------------------

    // Activation and display behavior happens at document ready time.
    $(root).ready(function() {

	// The default name for the div the shell uses as its container is `shell-panel`, although that can be changed via
	// the shell config parameter `shell-panel-id`. The `Shell` display model relies on a 'panel' to contain a 'view'.
	// The 'panel' acts as the view-port, i.e. the visible portion of the shell content, while the 'view' is appended
	// to and scrolled up as new content is added.
	$shellPanel = $('#shell-panel');
	$discoveryPanel = $('#discovery-panel');
	$discoveryPanel.append('<div>discovery panel</div');
	$buildPanel = $('#build-panel');


	// We use **jquery-ui**'s `resizable` to let us drag the bottom edge of the console up and down.
	$shellPanel.resizable({ handles: "s"});
	$buildPanel.resizable({ handles: "s"});

	// Wire up a the keypress handler. This will be used only for shell activation.
	$(document).keypress(function(event) {

            // If the shell is already active drop out of the keyhandler, since all keyhandling happens in `Readline`.
            if(shell.isActive()) {
		return;
            }

            // Mimicking *Quake*-style dropdown consoles, we activate and show on `~`.
            if(event.keyCode == 126) {
		event.preventDefault();
		activateConsolePanel();
            }
	});

	// Attach our hide function to the EOT and Cancel events.
	shell.onEOT(hideAndDeactivate);
	shell.onCancel(hideAndDeactivate);
    });

  })(root, $, _);
})(this, $, _);
