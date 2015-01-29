var Josh = Josh || {};
(function(root, $, _) {
  Josh.Zdb = (function(root, $, _) {
    // Enable console debugging, when Josh.Debug is set and there is a console object on the document root.
    var _console = (Josh.Debug && root.console) ? root.console : {
      log: function() {
      }
    };

    var wsUri = "ws://sj7:7682/";

      var itemTemplate = _.template("<% _.each(items, function(item, i) { %><div><%- item %></div><% }); %>");
      var fooTemplate = _.template("<div><% _.each(items, function(item, i) { %><%- item %><<% }); %></div>");
      function writeToScreen(message, callback) {
	  _console.log('writeToScreen: ' + message);
	  _console.log('callback='+callback);
	  _console.log('itemTemplate='+itemTemplate({items: [message]}));
	  callback(itemTemplate({items: [message]}));
      }

      function runShellCommand(cmd, cb) {
	  var callback = cb;
	  var result = "";
	  var websocket = new WebSocket(wsUri, "shell");
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
      function pullFile(file, cb) {
	  var callback = cb;
	  var websocket = new WebSocket(wsUri + file, "pull");
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
	      runShellCommand(args.join(' '), callback);
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

    // Setup Document Behavior
    // -----------------------

    // Activation and display behavior happens at document ready time.
    $(root).ready(function() {

	// The default name for the div the shell uses as its container is `shell-panel`, although that can be changed via
	// the shell config parameter `shell-panel-id`. The `Shell` display model relies on a 'panel' to contain a 'view'.
	// The 'panel' acts as the view-port, i.e. the visible portion of the shell content, while the 'view' is appended
	// to and scrolled up as new content is added.
	var $consolePanel = $('#shell-panel');

	var activateConsolePanel = function() {
	    _console.log("activating shell");
	    shell.activate();
	    $consolePanel.slideDown();
	    $consolePanel.focus();
	};

	// We use **jquery-ui**'s `resizable` to let us drag the bottom edge of the console up and down.
	$consolePanel.resizable({ handles: "s"});

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

	// Whenever we get either a `EOT` (`Ctrl-D` on empty line) or a `Cancel` (`Ctrl-C`) signal from the shell,
	// we deactivate the shell and hide the console.
	function hideAndDeactivate() {
            _console.log("deactivating shell");
            shell.deactivate();
            $consolePanel.slideUp();
            $consolePanel.blur();
	}

	// Attach our hide function to the EOT and Cancel events.
	shell.onEOT(hideAndDeactivate);
	shell.onCancel(hideAndDeactivate);
    });

  })(root, $, _);
})(this, $, _);
