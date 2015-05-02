var SSH = require('simple-ssh');
var fs = require('fs');
var singleLineLog = require('single-line-log').stdout;
exports.doSSH = function(options, progress, fail) {
	var logOptions = {
		err: function(stderr) {
			singleLineLog(stderr)
		},
		out: function(stdout) {
			singleLineLog(stdout);
		},
		exit: function() {
			progress(ssh.count())
		}
	}
	var ssh = new SSH({
		host: options.host,
		user: options.user,
		key: options.key
	})
	options.commands.forEach(function (command) {
		ssh.exec(command, logOptions)
	})
	ssh.start({
		fail: fail
	})
}