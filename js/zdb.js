var Josh = Josh || {};
(function(root, $, _) {
  Josh.Zdb = (function(root, $, _) {
    // Enable console debugging, when Josh.Debug is set and there is a console object on the document root.
    var _console = (Josh.Debug && root.console) ? root.console : {
      log: function() {
      }
    };

      // default value of buildServerAddress, but we look it up from root.location.origin down below
      var buildServerAddress = '54.86.72.185';
      var $shellPanel;
      var $discoveryPanel;
      var $buildPanel, $buildView;
      var $editor;
      var $filename;
      var htmlPrefix = root.location.pathname.slice(0, root.location.pathname.lastIndexOf('/'));
      var wsUri = 'ws' + root.location.origin.slice(4) + '/ws/';
      var username;
      var deviceUri;
      var projectField;
      var dirField;
      var buildButton;
      var buildProgress;
      var networkPrefixField;
      var discoverButton;
      var runButton;
      //_console.log("htmlPrefix: " + htmlPrefix);
      //_console.log('wsUri: ' + wsUri);

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
      function runStreamingShellCommand(cmd, uri) {
	  if (!uri)
	      uri = wsUri;
	  _console.log('runStreamingShellCommand: ' + uri);
	  var websocket = new WebSocket(uri, 'shell');
	  var deferred = $.Deferred();
	  var fragment = {};
	  websocket.onopen = function(evt) {
	      websocket.send(cmd);
	  };
	  websocket.onclose = function(evt) {
	      _console.log('runStreamingShellCommand closed ' + cmd);
	      _console.log('reason: ' + evt.reason + ' code: ' + evt.code + ' wasClean: ' + evt.wasClean);
	      websocket.close();
	      for (var prefix in fragment) {
		  if (fragment[prefix])
		      deferred.notify({'prefix': prefix, 'lines': [fragment[prefix]]});
		  fragment[prefix] = "";
	      }
	      deferred.resolve();
	  };
	  websocket.onmessage = function(evt) {
	      var prefix = ''
	      var data = evt.data
	      //_console.log(data);
	      if (data.indexOf('<hb>') == 0)
		  return;
	      if (data.indexOf('<err>') == 0) {
		  prefix = '<err>';
	      } else if (data.indexOf('<status>') == 0) {
		  prefix = '<status>';
	      }
	      data = data.slice(prefix.length);

	      if (fragment[prefix]) {
		  _console.log('prepending fragment: ' + fragment[prefix]);
		  data = fragment[prefix] + data;
		  fragment[prefix] = "";
	      }
	      var lines = data.split('\n');
	      // if last line is empty, drop it, otherwise it is a fragment to include next time
	      var frag = lines[lines.length - 1];
	      if (frag !== "") {
		  fragment[prefix] = frag;
		  _console.log('new fragment: ' + fragment);
	      }
	      lines = lines.slice(0, lines.length-1);
	      deferred.notify({'prefix': prefix, 'lines': lines});
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
      function editFile (filename) {
	  var deferred = $.Deferred();
	  var d = getFile(filename, wsUri);
	  d.done(function (v) {
	      var name = filename.slice(filename.lastIndexOf('/')+1);
	      $('#firsttabli').empty();
	      $('#firsttabli').append('<li><a href="#footxt">' + name + '</a></li');
	      $('#tabs').slideDown();
	      $editor.setValue(v);
	      deferred.resolve(filename);
	  });
	  d.fail(function (v) {
	      deferred.reject(v);
	  });
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
	var netaddrs = ['192.168.168.100', '192.168.1.100', '172.17.1.200'];
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
	  var boardname = $('#boardname').val();
	  fileList.empty();
	  function callback(info) {
	      var lines = info.lines;
	      for (var i in lines) {
		  var text = lines[i];
		  //_console.log('text: ' + text);
		  if (text.indexOf('<file>') == 0) {
		      var filename = text.slice(6);
		      if (filename.indexOf(boardname) == 0) {
			  var uri = htmlPrefix + '/' + username + '/' + $project;
		      } else {
			  var uri = 'https:' + $repo.slice(4) + '/blob/master';
		      }
		      if ($dir)
			  uri = uri + '/' + $dir;
		      uri = uri + '/' + filename;
		      fileList.append('<li><a href="' + uri + '">' + filename + '</a><button id="editbutton" value="' + filename + '">Edit</button></li>');
		      filePanel.animate({'scrollTop': fileView.height()}, 1);
		  }
	      }
	      $('button').button().click(function (evt) {
		  evt.preventDefault();
		  _console.log('clicked: ' + evt.currentTarget.value);
		  editFile(username + '/' + $project + '/' + evt.currentTarget.value);
	      });
	  }
	  cmdinfo = {'cmd': 'clone.py',
		     'repo': repourl,
		     'dir': dir,
		     'username': username,
		     'branch': 'master',
		     'boardname': boardname
		    };
	  cmd = JSON.stringify(cmdinfo);
	  var d = runStreamingShellCommand(cmd, wsUri);
	  d.done(function () {
	  });
	  d.fail(function () {
	  });
	  d.progress(callback);
      };

      var progressLevels = {
	  "makefilegen.py": 1,
	  "touch syntax.timestamp": 5,
	  'BSCVERILOG': 10,
	  '/usr/share/connectal/../fpgamake/fpgamake': 15,
	  'synth_design': 20,
	  'link_design -top mkZynqTop': 30,
	  'opt_design': 35,
	  'place_design': 45,
	  'phys_opt_design': 60,
	  'route_design': 80,
	  'write_bitstream -bin_file -force Impl/TopDown/mkTop.bit': 90
      };
      var runBuild = function(repourl, dir) {
	  if (repourl) {
	      setProject(repourl, dir, 1);
	  } else {
	      repourl = $repo;
	      dir = $dir;
	  }	  
	  var boardname = $('#boardname').val();
	  var branch = $('#branch').val();
	  if (!branch)
	      branch = 'master';
	  _console.log("running build " + repourl + ' dir ' + dir + ' target ' + boardname);
	  $buildView.empty();
	  $buildPanel.slideDown();
	  function callback(info) {
	      var lines = info.lines;
	      for (var i in lines) {
		  var text = lines[i];
		  for (var key in progressLevels) {
		      var level = progressLevels[key];
		      if (text.indexOf(key) >= 0)
			  buildProgress.progressbar("option", "value", level);
		  }
		  $buildView.append(text);
		  $buildView.append('<br>');
		  $buildPanel.animate({'scrollTop': $buildView.height()}, 10);
	      }
	  }
	  cmdinfo = {'cmd': 'build.py',
		     'repo': repourl,
		     'dir': dir,
		     'username': username,
		     'branch': branch,
		     'boardname': boardname
		    };
	  cmd = JSON.stringify(cmdinfo);
	  var d = runStreamingShellCommand(cmd);
	  buildButton.val('building...');
	  buildProgress.progressbar("option", "value", 0);
	  d.progress(callback);
	  d.done(function () {
	      buildProgress.progressbar("option", "value", 100);
	      buildButton.val('Build');
	  });
	  d.fail(function () {
	      buildButton.val('Build');
	  });
      };

      var runBluesim = function(repourl, dir) {
	  if (repourl) {
	      setProject(repourl, dir, 1);
	  } else {
	      repourl = $repo;
	      dir = $dir;
	  }	  
	  var boardname = $('#boardname').val();
	  var branch = $('#branch').val();
	  if (!branch)
	      branch = 'master';
	  _console.log("running bluesim " + repourl + ' dir ' + dir + ' target ' + boardname);
	  $buildView.empty();
	  $buildPanel.slideDown();
	  function callback(info) {
	      var lines = info.lines;
	      for (var i in lines) {
		  var text = lines[i];
		  for (var key in progressLevels) {
		      var level = progressLevels[key];
		      if (text.indexOf(key) >= 0)
			  buildProgress.progressbar("option", "value", level);
		  }
		  $buildView.append(text);
		  $buildView.append('<br>');
		  $buildPanel.animate({'scrollTop': $buildView.height()}, 10);
	      }
	  }
	  cmdinfo = {'cmd': 'run.py',
		     'repo': repourl,
		     'dir': dir,
		     'username': username,
		     'branch': branch,
		     'boardname': boardname
		    };
	  cmd = JSON.stringify(cmdinfo);
	  var d = runStreamingShellCommand(cmd);
	  runButton.val('running...');
	  buildProgress.progressbar("option", "value", false);
	  d.progress(callback);
	  d.done(function () {
	      buildProgress.progressbar("option", "value", 100);
	      runButton.val('Run');
	  });
	  d.fail(function () {
	      runButton.val('Run');
	  });
      };

      var displayBuildLines = function(obj) {
	  var prefix = obj.prefix;
	  var lines = obj.lines;
	  for (var i in lines) {
	      _console.log('DBL: ' + prefix + lines[i]);
	      if (!prefix) {
		  $buildView.append('<p>'+lines[i]+'</p>');
	      } else if (prefix === '<status>') {
		  if (lines[i] !== "0")
		      $buildView.append('<p class="ui-state-highlight">Process exited with code '+lines[i]+'</p>');
	      } else {
		  $buildView.append('<p class="ui-state-highlight">'+prefix+lines[i]+'</p>');
	      }
	  }
	  $buildPanel.animate({'scrollTop': $buildView.height()}, 10);
      }

      var runDevice = function(args) {
	  $buildView.empty();
	  $buildPanel.slideDown();
	  if (!deviceUri) {
	      $buildView.append("<div>Error: Address of device is unknown.</div>");
	      return;
	  }
	  var boardname = $('#boardname').val();
	  var baseuri = 'http://' + buildServerAddress + htmlPrefix + '/' + username + '/' + $project;
	  if ($dir && ($dir !== 'undefined'))
	      baseuri = baseuri + '/' + $dir;
	  var cmds = ['rm -f /mnt/sdcard/android.exe /mnt/sdcard/mkTop.xdevcfg.bin.gz',
		      'cd /mnt/sdcard; wget ' + baseuri + '/' + boardname + '/bin/android.exe',
		      'cd /mnt/sdcard; wget ' + baseuri + '/' + boardname + '/bin/mkTop.xdevcfg.bin.gz',
		      'chmod agu+rx /mnt/sdcard/android.exe',
		      'rmmod portalmem && insmod /mnt/sdcard/portalmem.ko',
		      'rmmod zynqportal && insmod /mnt/sdcard/zynqportal.ko',
		      'zcat /mnt/sdcard/mkTop.xdevcfg.bin.gz > /dev/xdevcfg && cat /dev/connectal && echo logic programmed',
		      '/mnt/sdcard/android.exe'
		     ];
	  var deferreds = [];
	  function chainCommands() {
	      if (cmds[0]) {
		  var cmd = cmds[0];
		  _console.log('chainCommands cmd='+cmd);
		  cmds = cmds.slice(1);
		  var d = runStreamingShellCommand(cmd, deviceUri);
		  d.progress(displayBuildLines);
		  d.done(chainCommands);
	      }
	  }
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
	      var boardname = $('#boardname').val();
	      _console.log('boardname=' + boardname);
	      if (boardname == 'bluesim') {
		  runBluesim(args);
	      } else {
		  runDevice(args);
	      }
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
	      var uri = htmlPrefix + '/connectal/examples/echowebsocket/bluesim/generatedDesignInterfaceFile.json';
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
	$(document).tooltip();

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
	$buildPanel.resizable();
	$('#file-panel').resizable();

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
	      var boardname = $('#boardname').val();
	      _console.log('boardname=' + boardname);
	      if (boardname == 'bluesim') {
		  runBluesim($project, $dir);
	      } else {
		  if (!deviceUri)
		      probeAddr(networkPrefixField.val(), 7682, $discoveryPanel, function() {});
		  runDevice($project, $dir);
	      }
	});
	buildProgress = $('#progressbar');
	buildProgress.progressbar({value: 0});
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

	setProject($repo, $dir);

	d = runStreamingShellCommand('host ' + root.location.origin.slice(root.location.origin.indexOf(':')+3),
				     wsUri);
	d.progress(function (info) {
	    var pat = 'has address ';
	    for (var i in info.lines) {
		var line = info.lines[i];
		_console.log('host line: ' + line);
		var pos = line.indexOf(pat);
		if (pos >= 0) {
		    buildServerAddress = line.slice(pos + pat.length);
		    _console.log('buildServerAddress: ' + buildServerAddress);
		}
	    }
	});

    });

  })(root, $, _);
})(this, $, _);
