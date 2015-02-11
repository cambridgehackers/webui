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
      var $buildPanel, $buildView;
      var $editor;
      var $filename;
      var wsUri = 'ws' + root.location.origin.slice(4) + '/ws/';
      var username;
      var deviceUri;
      var projectField;
      var dirField;
      var buildButton;
      var networkPrefixField;
      var discoverButton;
      var runButton;
      _console.log(wsUri);

      var itemTemplate = _.template('<% _.each(items, function(item, i) { %><div><%- item %></div><% }); %>');
      var errItemTemplate = _.template('<% _.each(items, function(item, i) { %><div><span class="stderr"><%- item %></span></div><% }); %>');
      var fooTemplate = _.template("<div><% _.each(items, function(item, i) { %><%- item %><<% }); %></div>");
      function writeToScreen(message, callback) {
	  _console.log('writeToScreen: ' + message);
	  _console.log('callback='+callback);
	  _console.log('itemTemplate='+itemTemplate({items: [message]}));
	  callback(itemTemplate({items: [message]}));
      }

      function keys(o) {
	  var ks = [];
	  for (var k in o) {
	      ks.push(k);
	  }
	  return ks;
      };

      function WebSocketRequestProxy(intname, metadata, uri) {
	  var obj = {'metadata': metadata};
	  for (var i in metadata.interfaces) {
	      var decl = metadata.interfaces[i];
	      if (decl.name == intname) {
		  _console.log("new WebSocket for " + intname);
		  var ws = new WebSocket(uri);
		  ws.messages = [];
		  ws.isopen = false;
		  ws.onopen = function(evt) {
		      _console.log(intname + ':connected via ' + uri);
		      for (var m in ws.messages) {
			  ws.send(ws.messages[m]);
			  ws.messages = [];
		      }
		  };
		  ws.onmessage = function(evt) {
		      _console.log("received websocket message: " + evt.data);
		  }
		  ws.onerror = function(evt) {
		      callback('error: ' + evt.data);
		  };
		  ws.onclose = function(evt) {
		      _console.log('websocket closed');
		  }
		  var methodDecls = decl.decls;
		  for (var j in methodDecls) {
		      var methodDecl = methodDecls[j];
		      _console.log("method " + methodDecls[j].name);
		      obj[methodDecl.name] = (function (methodDecl) {
			  function marshall() {
			      var message = {"name":methodDecl.name};
			      var params = methodDecl.params;
			      var a = 0;
			      for (var k in params) {
				  message[params[k]] = arguments[a];
				  a++;
			      }
			      _console.log("method: " + methodDecl.name + " message: " + message);
			      if (ws.isopen)
				  ws.send(message);
			      else
				  ws.messages.push(message);
			  };
			  return marshall;
		      })(methodDecl);
		  }
	      }
	  }
	  return obj;
      };

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
      function runStreamingShellCommand(cmd, cb, uri, rawtext) {
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
	      _console.log('runStreamingShellCommand closed ' + cmd);
	      _console.log('reason: ' + evt.reason + ' code: ' + evt.code + ' wasClean: ' + evt.wasClean);
	      websocket.close();
	      deferred.resolve();
	  };
	  websocket.onmessage = function(evt) {
	      var prefix = ''
	      var data = evt.data
	      if (data.indexOf('<hb>') == 0)
		  return;
	      if (data.indexOf('<err>') == 0) {
		  prefix = '<err>';
		  data = data.slice(5);
	      }
	      var lines = data.split('\n');
	      if (rawtext)
		  callback(lines);
	      else if (!prefix)
		  callback(itemTemplate({items:lines}));
	      else
		  callback(errItemTemplate({items:lines}));
	      deferred.notify(lines);
	  };
	  websocket.onerror = function(evt) {
	      _console.log('ERROR: ' + evt);
	      _console.log('keys(evt)=' + keys(evt));
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
      function getFile(file, uri) {
	  if (!uri)
	      uri = wsUri;
	  var websocket = new WebSocket(uri + file, "pull");
	  var result = "";
	  var deferred = $.Deferred();
	  websocket.onopen = function(evt) {
	      websocket.send('hello');
	  };
	  websocket.onclose = function(evt) {
	      websocket.close();
	      deferred.resolve(result);
	  };
	  websocket.onmessage = function(evt) {
	      result = result + evt.data;
	  };
	  websocket.onerror = function(evt) {
	      _console.log('ERROR: ' + evt);
	      deferred.reject(evt.data);
	  }
	  return deferred;
      };
      function putFile(file, text, uri) {
	  if (!uri)
	      uri = wsUri;
	  var websocket = new WebSocket(uri + file, "push");
	  var deferred = $.Deferred();
	  var result = '';
	  websocket.onopen = function(evt) {
	      websocket.send(text);
	      websocket.close();
	  };
	  websocket.onclose = function(evt) {
	      deferred.resolve(result);
	  };
	  websocket.onmessage = function(evt) {
	      result = result + evt.data;
	  };
	  websocket.onerror = function(evt) {
	      deferred.reject(evt);
	  }
	  return deferred;
      };

      function probeAddr(ipaddr, port, discoveryPanel, shellCallback) {
	  var uri = 'ws://' + ipaddr + ':' + port + '/ws/';
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

    function runDiscovery(addr, shellCallback) {
	var i;
	var netaddrs = ['192.168.168.100', '192.168.1.100', '54.86.72.185', '172.17.1.200'];
	if (addr)
	    netaddrs = [addr];
	for (n in netaddrs) {
	    var netaddr = netaddrs[n].split('.');
	    var firstaddr = parseInt(netaddr[3]);
	    for (var i = 0; i < 10; i++) {
		netaddr[3] = i + firstaddr;
		console.log('Probing ' + netaddr);
		probeAddr(netaddr.join('.'), 7682, $discoveryPanel, shellCallback);
	    }
	}
	setTimeout(function () { if (!deviceUri) shellCallback('<div>Discovery timed out</div>'); },
		   2000);
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

      // a default project for a new user to build
      var $repo = "git://github.com/zedblue/leds";
      var $project;
      var $dir;
      var setProject = function(repourl, dir, updateFields) {
	  _console.log('running repo ' + repourl + ' dir ' + dir);
	  function callback(text) {
	      $buildView.append(text);
	      $buildView.append('<br>');
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
	  $.session.set("connectalrepo", $repo, 1);
	  $.session.set("connectalproject", $project, 1);
	  $.session.set("connectaldir", $dir, 1);
	  if (updateFields) {
	      projectField.val($repo);
	      dirField.val($dir);
	  }
	  runClone($repo, $dir);
      };

      var runClone = function(repourl, dir) {
	  _console.log("running clone " + repourl + ' dir ' + dir);
	  $buildView.empty();
	  $buildPanel.slideDown();
	  var filePanel = $('#file-panel');
	  var fileView = $('#file-view');
	  var fileList = $('#file-list');
	  fileList.empty();
	  function callback(lines) {
	      for (var i in lines) {
		  var text = lines[i];
		  _console.log('text: ' + text);
		  if (text.indexOf('<file>') == 0) {
		      var filename = text.slice(6);
		      if (filename.indexOf('zedboard') == 0) {
			  var uri = '/ui/' + username + '/' + $project;
		      } else {
			  var uri = 'https:' + $repo.slice(4) + '/blob/master';
		      }
		      if ($dir)
			  uri = uri + '/' + $dir;
		      uri = uri + '/' + filename;
		      fileList.append('<li><a href="' + uri + '">' + filename + '</a></li>');
		      filePanel.animate({'scrollTop': fileView.height()}, 10);
		  }
	      }
	  }
	  cmdinfo = {'cmd': 'clone.py',
		     'repo': repourl,
		     'dir': dir,
		     'username': username,
		     'branch': 'master'
		    };
	  cmd = JSON.stringify(cmdinfo);
	  var d = runStreamingShellCommand(cmd, callback, wsUri, 1);
	  d.done(function () {
	  });
	  d.fail(function () {
	  });
      };

      var runBuild = function(repourl, dir) {
	  if (repourl) {
	      setProject(repourl, dir, 1);
	  } else {
	      repourl = $repo;
	      dir = $dir;
	  }	  
	  _console.log("running build " + repourl + ' dir ' + dir);
	  $buildView.empty();
	  $buildPanel.slideDown();
	  function callback(text) {
	      $buildView.append(text);
	      $buildView.append('<br>');
	      $buildPanel.animate({'scrollTop': $buildView.height()}, 10);
	  }
	  cmdinfo = {'cmd': 'build.py',
		     'repo': repourl,
		     'dir': dir,
		     'username': username,
		     'branch': 'master'
		    };
	  cmd = JSON.stringify(cmdinfo);
	  var d = runStreamingShellCommand(cmd, callback);
	  buildButton.val('building...');
	  d.done(function () {
	      buildButton.val('Build');
	  });
	  d.fail(function () {
	      buildButton.val('Build');
	  });
      };

      var displayBuildLines = function(lines) {
	  for (var i in lines)
	      $buildView.append('<p>'+lines[i]+'</p>');
      }

      var runDevice = function(args) {
	  var cmds = ['cd /mnt/sdcard',
		      'rm -f android.exe mkTop.xdevcfg.bin.gz',
		      'wget http://54.86.72.185/ui/' + username + '/' + $project + '/' + $dir + '/zedboard/bin/android.exe',
		      'wget http://54.86.72.185/ui/' + username + '/' + $project + '/' + $dir + '/zedboard/bin/mkTop.xdevcfg.bin.gz',
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
	  $buildView.empty();
	  $buildPanel.slideDown();
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
      shell.setCommandHandler("git", {
	  exec: function(cmd, args, callback) {
	      _console.log("git args=" + args);
	      if (wsUri && $project)
		  runShellCommand('cd "' + $project + '"; git ' + args.join(' '), callback, deviceUri);
	      else
		  callback("Error: no project defined");
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
	      _console.log("starting device discovery " + args[0]);
	      runDiscovery(args[0], callback);
	  }
      });
      shell.setCommandHandler("project", {
	  exec: function(cmd, args, callback) {
	      setProject(args[0], args[1], 1);
	      callback("");
	  }
      });
      shell.setCommandHandler("build", {
	  exec: function(cmd, args, callback) {
	      callback("");
	      runBuild(args[0], args[1]);
	  }
      });
      shell.setCommandHandler("run", {
	  exec: function(cmd, args, callback) {
	      callback("");
	      runDevice(args);
	  }
      });
      shell.setCommandHandler("exit", {
	  exec: function(cmd, args, callback) {
	      callback("");
	      hideAndDeactivate();
	  }
      });
      shell.setCommandHandler("edit", {
	  exec: function(cmd, args, callback) {
	      $filename = args[0];
	      var d = getFile($filename, wsUri);
	      d.done(function (v) {
		  $('#tabs').slideDown();
		  $editor.setValue(v);
		  callback("");
	      });
	      d.fail(function (v) {
		  callback('Error: ' + v);
	      });
	  }
      });
      shell.setCommandHandler("save", {
	  exec: function(cmd, args, callback) {
	      var filename = args[0];
	      if (!filename)
		  filename = $filename;
	      if (filename) {
		  var d = putFile(filename, $editor.getValue(), wsUri);
		  d.done(function (v) {
		      callback("");
		  });
	      }
	  }
      });
      shell.setCommandHandler("websocket", {
	  exec: function(cmd, args, callback) {
	      var uri = args[0];
	      var msg = args[1];
	      var ws = new WebSocket(uri);
	      ws.onopen = function(evt) {
		  if (msg) {
		      ws.send(msg);
		  }
		  callback('connected and sent message');
	      };
	      ws.onmessage = function(evt) {
		  _console.log("received websocket message: " + evt.data);
	      }
	      ws.onerror = function(evt) {
		  callback('error: ' + evt.data);
	      };
	      ws.onclose = function(evt) {
		  _console.log('websocket closed');
	      }
	  }
      });
      var $proxy;
      shell.setCommandHandler("proxy", {
	  exec: function(cmd, args, callback) {
	      var intname = args[0];
	      var uri = '/ui/connectal/examples/echowebsocket/bluesim/generatedDesignInterfaceFile.json';
	      $.getJSON(uri, function (data) {
		  _console.log("interface data", data);
		  callback(data);
		  $proxy = new WebSocketRequestProxy(intname, data, 'ws://127.0.0.1:5001/');
		  _console.log("$proxy: " + $proxy);
		  for (var i in $proxy)
		      _console.log("$proxy[" + i + "]=" + $proxy[i]);
		  $proxy.say(42);
	      });
	  }
      });

    // Setup Document Behavior
    // -----------------------

    // Activation and display behavior happens at document ready time.
    $(root).ready(function() {


	var newusername = 'user' + Math.round(Math.random()*100000);
	//$.session.set('connectaluser', newusername, 1);
	username = $.session.get('connectaluser');
	if (username)
	    _console.log("username=" + username);
	else {
	    _console.log("setting username");
	    username = newusername;
	    $.session.set('connectaluser', username, 1);
	}
	$('#username').val(username);
	$('#username').change(function (evt) {
	    username = $('#username').val();
	    $.session.set('connectaluser', username, 1);
	});
	if ($.session.get("connectalrepo"))
	    $repo = $.session.get("connectalrepo");
	$project = $.session.get("connectalproject");
	$dir = $.session.get("connectaldir");
	if ($dir === "undefined")
	    $dir = "";

	// The default name for the div the shell uses as its container is `shell-panel`, although that can be changed via
	// the shell config parameter `shell-panel-id`. The `Shell` display model relies on a 'panel' to contain a 'view'.
	// The 'panel' acts as the view-port, i.e. the visible portion of the shell content, while the 'view' is appended
	// to and scrolled up as new content is added.
	$shellPanel = $('#shell-panel');
	$discoveryPanel = $('#discovery-panel');
	$buildPanel = $('#build-panel');
	$buildView = $('#build-view');


	// We use **jquery-ui**'s `resizable` to let us drag the bottom edge of the console up and down.
	$shellPanel.resizable();
	$buildPanel.resizable();

	// Wire up a the keypress handler. This will be used only for shell activation.
	if (1) {
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
	}

	// Attach our hide function to the EOT and Cancel events.
	shell.onEOT(hideAndDeactivate);
	shell.onCancel(hideAndDeactivate);

	$("#tabs").tabs();
	$('#tabs').resizable({
	    'resize': function () {
		$editor.resize();
	    }
	});
	buildButton = $('#build_button');
	buildButton.button().click(function(evt) {
	    evt.preventDefault();
	    runBuild($repo, $dir);
	});
	discoverButton = $('#discover_button');
	discoverButton.button().click(function(evt) {
	    evt.preventDefault();
	    var prefix = networkPrefixField.val();
	    probeAddr(prefix, 7682, $discoveryPanel, function() {
		$.session.set("connectal_network_prefix", prefix);
	    });
	});
	runButton = $('#run_button');
	runButton.button().click(function(evt) {
	    evt.preventDefault();
	    if (!deviceUri)
		probeAddr(networkPrefixField.val(), 7682, $discoveryPanel, function() {});
	    runDevice($project, $dir);
	});
	networkPrefixField = $('#network_prefix');
	networkPrefixField.change(function (evt) {
	    _console.log('probing addr ' + networkPrefixField.val());
	    var prefix = networkPrefixField.val();
	    probeAddr(prefix, 7682, $discoveryPanel, function() {
		$.session.set("connectal_network_prefix", prefix);
	    });
	});
	var prefix = $.session.get("connectal_network_prefix");
	if (prefix)
	    networkPrefixField.val(prefix);
	projectField = $('#project');
	projectField.val($repo);
	projectField.change(function (evt) {
	    setProject(projectField.val(), $dir);
	});
	dirField = $('#dir');
	dirField.val($dir);
	dirField.change(function (evt) {
	    setProject($repo, dirField.val());
	});
	$editor = ace.edit("footxt");
	$editor.setTheme("ace/theme/monokai");
	$editor.getSession().setMode("ace/mode/verilog");
	var bareditor = ace.edit("bartxt");
	bareditor.setTheme("ace/theme/monokai");
	bareditor.getSession().setMode("ace/mode/verilog");

	setProject($repo, $dir);

    });

  })(root, $, _);
})(this, $, _);
