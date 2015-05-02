var Promise = require('bluebird');
var DigitalOcean = require('do-wrapper');
var colors = require('colors');
var _ = require('underscore');
var fs = require('fs');
var async = require('async');
var ssh = require('./ssh');

exports.deploy = function (config) {
	var api = new DigitalOcean(config.do_token, 50);
	var ips = []
	var masterIp = null;
	Promise.promisifyAll(Object.getPrototypeOf(api));
	Promise.promisifyAll(async);

	Promise.try(function() {
		return api.accountAsync();
	})
	.get(1)
	.then(function (account) {
		console.log(colors.green('Logged in using account ' + account.account.email))
		return api.dropletsGetAllAsync({})
	})
	.get(1)
	.then(function (droplets) {
		console.log(colors.underline('Droplets:'));
		return async.timesSeriesAsync(config.instances, function (n, next) {
			var droplet_name = config.prefix + '-' + (n+1)
			var droplet_exists = _.findWhere(droplets.droplets, {
				name: droplet_name
			});
			if (droplet_exists) {
				console.log(colors.green(droplet_name + ' already exists.'))
				next(null, droplet_exists)
			}
			else {
				console.log(colors.yellow(droplet_name + ' does not exist. Creating...'));
				api.dropletsCreate({
					region: config.region,
					size: config.size,
					name: droplet_name,
					image: config.image,
					ssh_keys: config.ssh_keys,
					backups: false,
					ipv6: true,
					user_data: null,
					private_networking: config.private_networking
				}, function (err, body, response) {
					if (err) throw new Error(err);
					console.log(colors.green('Droplet created.'))
					next(null, response.droplet)
				})
			}
		})
	})
	.then(function (all_droplets) {
		var isFirst = true;
		return async.eachSeriesAsync(all_droplets, function (droplet, done) {
			console.log(colors.underline('Deploying to droplet ' + droplet.name));
			var tryToUpload = function(_droplet) {
				var public_network = _.findWhere(_droplet.networks.v4, {
					type: 'public'
				});
				if (public_network && _droplet.status != 'new') {
					if (isFirst) {
						isFirst = false;
						masterIp = public_network.ip_address;
					}
					var private_network = _.findWhere(_droplet.networks.v4, {
						type: 'private'
					});

					var commands = 0
					process.stdout.write('\rExecuting commands...')
					ssh.doSSH({
						host: public_network.ip_address,
						user: 'root',
						key: config.key,
						commands: config.commands
					}, function (total_commands) {
						commands++
						process.stdout.write('\rDeploying to droplet ' + _droplet.name+ ' - ' + commands + '/' + total_commands)
						if (total_commands == commands) {
							if (private_network) {
								ips.push(private_network.ip_address);
							}
							else {
								ips.push(public_network.ip_address);
							}
							process.stdout.write('\n\n')
							done(null, true)
						}
					}, function() {
						// Fail callback: sometimes the droplet isn't quite ready.
						// Just try again.
						tryToUpload(_droplet)
					})
				}
				else {
					api.dropletsGetById(_droplet.id, function (err, body, response) {
						process.stdout.write('\rWaiting for droplet to start up...')
						tryToUpload(response.droplet)
					});
				}
			}
			tryToUpload(droplet);
		});
	})
	.then(function () {
		var steps = 0;
		var clusterblock = [];
		clusterblock.push('upstream cluster {')
		ips.forEach(function (ip) {
			clusterblock.push('    server ' + ip + ':' + config.port + ';')
		});
		clusterblock.push('}')
		var nginxfile = clusterblock.join('\n') + '\n' + config.nginx;
		console.log(colors.underline('Nginx file'));
		var commands = config.master_before
		commands.push('echo "' + nginxfile + '" > /etc/nginx/sites-available/default');
		commands = commands.concat(config.master_after)
		ssh.doSSH({
			host: masterIp,
			user: 'root',
			key: config.key,
			commands: commands
		}, function (step_count) {
			steps++;
			if (step_count == steps) {
				console.log('Nginx deployed. Load-balancing between '+ips.length+' servers now on ' + colors.green(masterIp))
			}
		}, function() {
			console.log('Nginx failed.')
		})
	})
	.catch(function(err) {
		console.log(err.message, err.stack);
	});
}