# DigitalOcean cluster deploy

This node.js script allows you upload an application to multiple DigitalOcean droplets and then load-balance between them using nginx. This way your application can handle more requests at the same time.

![Screenshot](http://i.imgur.com/vgJGj5Y.png)

## Requirements
You need to have SSH keys added to your DigitalOcean accounts.
You only have to change the `do_token`, `ssh_keys`, `key` fields to make the demo work!

## Notice
This script will cause charges to your DigitalOcean account. If you spin up 100 droplets using this script, it's your fault!

## Installation

````
npm install do-cluster-deploy
````

## Usage
All fields are required. Load-balancing has to work using nginx, otherwise you are free to use any technology you'd like.

````javascript
	var clusterDeploy = require('do-cluster-deploy');
	var fs = require('fs');

	clusterDeploy.deploy({
		// Your droplets will be named test-1, test-2 and so on.
		prefix: 'test',
		// If you use a region with private networking, it will be faster
		region: 'fra1',
		// Digital Ocean API token, obtain from your settings
		do_token: '9801xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
		// $5 instances are just fine for this demo
		size: '512mb',
		// If you enable this, you will benefit from faster speed. Not all regions might support this.
		private_networking: true,
		// SSH keys so you don't need a password. You need to enter those into your DO account first.
		ssh_keys: ['3b:03:7d:abxxxxxxxxxxxxxxxxxxx'],
		// Any OS goes!
		image: 'ubuntu-14-04-x64',
		// test-1 and test-2 droplets will be created *if they don't exist yet*
		instances: 2,
		// Setup commands
		commands: [
			// Install git if it doesn't exist yet
			'hash git || sudo apt-get install git --yes',
			// Install node.js if it doesn't exist
			'hash nodejs || curl -sL https://deb.nodesource.com/setup | sudo bash -',
			'hash nodejs || sudo apt-get install nodejs --yes',
			// Overwrite old app version
			'rm -rf node-hello-world',
			'git clone git://github.com/JonnyBurger/node-hello-world.git',
			// Start aoo
			'npm install forever -g',
			'killall node && killall nodejs',
			'forever start node-hello-world/index.js'
		],
		master_before: [
			// Install nginx
			// Will only be executed on test-1
			'hash nginx || sudo apt-get install nginx --yes'
		],
		master_after: [
			// Restart nginx
			// Will only be executed on test-1
			'sudo service nginx restart'
		],
		nginx: [
			// Nginx configuration
			// The cluster block gets configured automatically for you
			'server {',
			'    listen 80;',
			'    location / {',
			'        proxy_pass http://cluster;',
			'    }',
			'}'
		].join('\n'),
		// Which port does your app start on before you put nginx in front of it?
		port: 5000,
		// SSH key file that matches the ssh_keys above, so no password is needed
		key: fs.readFileSync('/Users/jonnyburger/.ssh/id_rsa')
	})
````