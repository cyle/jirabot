/*

    jirabot. whoa.

*/

var https = require('https');

// the offical slack client lib
var slack_client = require('slack-client');
var Message = require('./node_modules/slack-client/src/message');

// check for a config file when calling this script, we need it
if (process.argv.length < 3 || process.argv[2] === undefined) {
	console.log('jirabot requires a config file passed to it, please see README.');
	process.exit(1);
}

// load bot config
console.log('requiring config in file: ' + process.argv[2]);
var config = require(process.argv[2]);

// primary bot config
var bot_name = config.bot_name;
var jira_auth = config.auth;
var jira_hostname = config.jira_hostname;
var jira_manual_create_url = config.jira_manual_create_url;
var jira_browse_url = config.jira_browse_url;
var teams_list = {};
var flavor = [
	'Neat!',
	'Groovy.',
    'Delicious!',
	'Totally rad.',
	'Can\'t even believe it.',
	'Awesome!',
	'Nice!',
    'Off the hook',
    'BAM!',
    'BAM!!',
    'Amazing!!',
	'Bold.',
    'Out of bounds.',
	'Devastating.',
	'Eternal.',
	'Whoa.',
    'Not possible.',
    'Sizzling!',
    'Impossible, even for a computer!'
];

// init new instance of the slack real time client
// second param is autoReconnect, which seems to be broken, so setting to FALSE
var slack = new slack_client(config.api_token, false, false);

slack.on('open', function() {
	console.log(bot_name + ' is online, listening...');
	connected = true;
});

slack.on('error', function(err) {
	console.error('there was an error with slack: ');
	console.error(err);
});

slack.on('message', function(message) {

	// relevant:
	// message.type = message,

	if (message.type == 'message') {

		// relevant: message.text, message.channel, message.user, message.ts

		// store what kind of message this is
		var message_realtype = 'unknown';
		if (message.channel[0] == 'C') {
			message_realtype = 'channel';
		} else if (message.channel[0] == 'G') {
			message_realtype = 'group';
		} else if (message.channel[0] == 'D') {
			message_realtype = 'dm';
		}

		// if there is no user, then it's probably not something we need to worry about
		if (message.user === undefined) {
			return;
		}

		// get user info
		var user_from = slack.getUserByID(message.user);
		// console.log(user_from);
		// user_from has .name and .id and more

		// fetch channel/group/dm object
		var where = slack.getChannelGroupOrDMByID(message.channel);
		// console.log(where);
		// where has .id and .name

		// send the incoming message off to be parsed + responded to
		parse_message(message, user_from, message_realtype);
	} else {
		console.log(message);
		return; // do nothing with other types of messages for now
	}
});

// intentionally crashing on websocket close
slack.on('close', function() {
	console.error('websocket closed for some reason, crashing!');
	process.exit(1);
});

// add a trim() method for strings
String.prototype.trim = function() { return this.replace(/^\s\s*/, '').replace(/\s\s*$/, ''); };

// get a random integer between range
function getRandomInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

// random flavor
function getRandomFlavor() {
	return flavor[Math.floor(Math.random() * flavor.length)];
}

// clean up some dumb character problems
// these will cause jira to freak out, so let's convert them
function clean_string(s) {
	s = s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
	s = s.replace(/\u2014/g, "--");
	return s;
}

// add a unicode blank space to a string
function add_zerowidth(wat) {
	return wat.substring(0, 1) + '\u200B' + wat.substring(1);
}

// get team names
function get_team_keys(be_verbose, where) {
	var verbosity = false;
	if (be_verbose !== undefined && be_verbose === true && where !== undefined) {
		verbosity = true;
	}
	teams_list = {};
	var teams_req_options = {
		hostname: jira_hostname,
		port: 443,
		path: '/rest/api/2/project',
		method: 'GET',
		auth: jira_auth
	};
	https.get(teams_req_options, function(res) {
		var data = '';
		res.on('data', function(d) {
			data += d;
		});
		res.on('end', function() {
			// do something with data
			//console.log('data returned: ' + data);
			var teams;
			try {
				teams = JSON.parse(data);
			} catch (e) {
				console.error('could not parse teams JSON from jira, weird! ' + e);
                console.log(data);
				if (verbosity) {
					say('There was an error parsing the team codes from JIRA! Please try again.', where);
				}
				return;
			}
			teams_list = [];
			for (var i in teams) {
				teams_list[teams[i]["key"]] = teams[i]["name"];
			}
			if (verbosity) {
				say('Team codes fetched successfully!', where);
			}
		});
	}).on('error', function(e) {
		console.error('Error fetching teams from jira:');
		console.error(e);
		if (verbosity) {
			say('There was an error fetching the team codes! Oh no!', where);
		}
	});
}

// helper function, set reporter for ticket about actual submitter
function set_ticket_submitter(ticket_key, username) {
	var set_reporter = {
		"fields": {
			"reporter": {
				"name": username
			}
		}
	};

	var set_reporter_string = JSON.stringify(set_reporter);

	var set_reporter_req_options = {
		hostname: jira_hostname,
		port: 443,
		path: '/rest/api/2/issue/'+ticket_key+'/',
		method: 'PUT',
		auth: jira_auth,
		headers: {
			'Content-Type': 'application/json',
			'Content-Length': set_reporter_string.length
		}
	};

	var set_reporter_req = https.request(set_reporter_req_options, function(res) {
		// it gives back nothing, how helpful
	});

	set_reporter_req.on('error', function(e) {
		console.error('problem with reporter request: ' + e.message);
	});

	set_reporter_req.write(set_reporter_string); // send along POST data
	set_reporter_req.end(); // engage!
}

// send a message to the specified channel/group/whatever
// "where" needs to be a channel/group/dm object
function say(with_what, where, and_exit) {
	if (with_what === undefined || where === undefined) {
		console.error('uhhh dunno what to say or where');
		return;
	}
	var exit_when_done = false;
	if (and_exit !== undefined && and_exit === true) {
		exit_when_done = true;
	}
	// first send typing indicator
	var typing_indicator = new Message(slack, {
		'type': 'typing'
	});
	where.sendMessage(typing_indicator);
	// ok now send the actual message in a little while
	// this fuzziness makes the bot seem almost human
	setTimeout(function() {
		var the_message = new Message(slack, {
			'type': 'message',
			'text': with_what,
			'link_names': 1,
			'parse': 'full'
		});
		where.sendMessage(the_message);
		if (exit_when_done) {
			setTimeout(function() {
				process.exit(1);
			}, 500);
		}
	}, getRandomInt(500, 1200));
}

// send an attachment to the specified channel/group/whatever
// "where" needs to be a channel/group/dm object
function attach_ticket(ticket_info, where) {
	if (ticket_info === undefined || where === undefined) {
		console.error('uhhh dunno what to say or where');
		return;
	}
	// first send typing indicator
	var typing_indicator = new Message(slack, {
		'type': 'typing'
	});
	where.sendMessage(typing_indicator);
	// ok now send the actual message in a little while
	// this fuzziness makes the bot seem almost human
	setTimeout(function() {
		var attachments = [
			{
				"fallback": ticket_info.link+': "'+ticket_info.title+'" ('+ticket_info.status+'). Reported by '+add_zerowidth(ticket_info.reporter)+', assigned to '+add_zerowidth(ticket_info.assignee)+'. '+getRandomFlavor(),
				"title": ticket_info.id+": "+ticket_info.title,
				"title_link": ticket_info.link,
				"color": "#37465d",
				"text": "*Status:* "+ticket_info.status+"     *Reporter:* "+add_zerowidth(ticket_info.reporter)+"     *Assignee:* "+add_zerowidth(ticket_info.assignee)+"     *Flavor:* "+getRandomFlavor(),
				"mrkdwn_in": ["text"]
			}
		];
		var params = {
			"type": "message",
			"channel": where.id,
			"as_user": true,
			"parse": "full",
			"attachments": JSON.stringify(attachments)
		};
		slack._apiCall('chat.postMessage', params, function(wat) {
			if (wat.ok === false) {
				console.error('error sending attachment: ');
				console.error(wat);
			}
		});
	}, getRandomInt(500, 900));
}

// parse incoming message object, username, and message type
function parse_message(message_obj, user, message_type) {
	var username = user.name;
	if (username === bot_name) {
		return;
	}
	var email = user.profile.email;
	if (email === undefined || email === null) {
		console.error('user '+username+' does not have an email address, they cannot submit tickets. ignoring.');
		return;
	}
	var email_prefix_matches = email.match(/^([^@]+)@/i);
	var username_from_email = '';
	if (email_prefix_matches[1] !== undefined) {
		username_from_email = email_prefix_matches[1];
	}
	//console.log(username_from_email);
	var chatline = message_obj.text.trim();
	// fetch channel/group/dm object
	var where = slack.getChannelGroupOrDMByID(message_obj.channel);
	// console.log(where);
	// where has .id and .name, if needed

	var jira_ticket_regex = /\b(([A-Z]+)\-\d+)\b/;
	if (jira_ticket_regex.test(chatline) && chatline.indexOf(jira_browse_url) === -1) {
		var jira_ticket_matches = chatline.match(jira_ticket_regex);
		var jira_ticket_id = jira_ticket_matches[1].toUpperCase();
		var team_key = jira_ticket_matches[2].toUpperCase();
		if (teams_list[team_key] !== undefined) {
			var fetch_ticket_req_options = {
				hostname: jira_hostname,
				port: 443,
				path: '/rest/api/2/issue/'+jira_ticket_id,
				method: 'GET',
				auth: jira_auth
			};

			var fetch_ticket_req = https.request(fetch_ticket_req_options, function(res) {
				var data = '';
				res.on('data', function(d) {
					data += d;
				});
				res.on('end', function() {
					var ticket_info_raw = JSON.parse(data);
					//console.log(ticket_info);
					if (ticket_info_raw.errorMessages !== undefined) {
						say('Error fetching ticket! Oh no! ' + ticket_info_raw.errorMessages.join(', ') + '!', where);
					} else {
						var ticket_info = {
							id: jira_ticket_id,
							title: ticket_info_raw.fields.summary,
							link: jira_browse_url+jira_ticket_id,
							reporter: ticket_info_raw.fields.reporter.name,
							assignee: 'nobody yet',
							status: ticket_info_raw.fields.status.name
						};
						if (ticket_info_raw.fields.assignee !== null) {
							ticket_info.assignee = ticket_info_raw.fields.assignee.name;
						}
						attach_ticket(ticket_info, where);
					}
				});
			});

			fetch_ticket_req.on('error', function(e) {
				console.error('Problem when fetching ticket "'+jira_ticket_id+'": ' + e.message);
			});

			fetch_ticket_req.end(); // engage!
		}
		// normally we would return here to stop continuing parsing what's going on
		// but i'll let it continue in case you're referencing a ticket when creating a ticket
	}

	if (/^\.ticket( help)?$/i.test(chatline)) {
		say('You can enter a ticket via `.ticket [team code] [title] (=> [description])(optional)` (search team codes with `.ticket team [name]` or `.ticket teams`) or via '+jira_manual_create_url, where);
		return;
	}

	if (/^\.ticket (restart|kill)$/i.test(chatline) || /^jirabot.+(?:please.+)restart$/i.test(chatline)) {
		console.log('Exiting by command of user ' + username);
		say('Okay, restarting... hopefully, anyway...', where, true);
		return;
	}

    // sigh, this doesn't actually seem to be supported by Slack just yet, at least for bots
	if (/^jirabot.+(?:please.+)?leave$/i.test(chatline)) {
		console.log('Leaving channel '+where.name+' by command of user ' + username);
		where.leave();
		return;
	}

	if (/^\.ticket (refetch|retry|refresh) teams$/.test(chatline)) {
		say('Refetching team codes!', where);
		get_team_keys(true, where);
		return;
	}

	if (/^\.ticket teams$/i.test(chatline)) {
		var team_keys = Object.keys(teams_list);
		if (team_keys.length === 0) {
			say('Hmm team codes are missing, I\'ll try refetching... please try again in a few seconds.', where);
			get_team_keys(true, where);
		} else {
			team_keys = team_keys.sort();
			say('JIRA team codes: '+team_keys.join(', '), where);
		}
		return;
	}

	if (/^\.ticket team$/i.test(chatline)) {
		say('You can search for a JIRA team code via `.ticket team [name or search here]`', where);
		return;
	}

	if (/^\.ticket team (.+)$/i.test(chatline)) {
		var team_code_matches = chatline.match(/^\.ticket team (.+)$/i);
		var team_key = team_code_matches[1].toUpperCase();
		if (teams_list[team_key] !== undefined) {
			say('JIRA team code '+team_key+' is for *'+teams_list[team_key]+'*', where);
		} else {
			for (var key in teams_list) {
				if (teams_list[key].toLowerCase().indexOf(team_key.toLowerCase()) != -1) {
					say('Found this JIRA team: '+teams_list[key]+', using team code *'+key+'*', where);
					return;
				}
			}
			say('Could not find a team with that name, sorry.', where);
		}
		return;
	}

	if (/^\.ticket ([-_0-9A-Z]+)$/i.test(chatline)) {
		say('Sorry, but you cannot create a ticket without a summary after the team code.', where);
		return;
	}

	if (/^\.ticket ([-_0-9A-Z]+) (.+)/i.test(chatline)) {
		// make a ticket...
		var ticket_matches = chatline.match(/^\.ticket ([-_0-9A-Z]+) (.+)/i);
		var team_key = ticket_matches[1].toUpperCase();

		// make sure this team key is in the teams_list
		if (teams_list[team_key] === undefined) {
			say('Sorry but I don\'t recognize that team key, check it with `.ticket teams` or `.ticket team [name]`', where);
			return;
		}

		// first try to get ticket data by splitting with "=>" but as "&gt;"
		var ticket_data = ticket_matches[2].trim().split("=&gt;");

		var ticket_title = ticket_data[0].trim(); // always need this bad boy

		//console.log('new ticket!');
		//console.log('team: ' + team_key);
		//console.log('title: ' + ticket_title);

		if (ticket_title === '') {
			say('Sorry, but you cannot create a ticket without a summary after the team code.', where);
			return;
		}

		ticket_title = clean_string(ticket_title);

		var new_ticket = {
			"fields": {
				"project": {
					"key": team_key
				},
				"summary": ticket_title,
				"issuetype": {
					"id": 3 // "task" issue type by default
				},
				"labels": [
					"slack-created"
				]
			}
		};

		if (ticket_data[1] !== undefined && ticket_data[1].trim() !== '') {
			var ticket_description = ticket_data[1].trim();
			if (ticket_data.length > 2) {
				ticket_data.splice(0, 1);
				ticket_description = ticket_data.join("=&gt;").trim();
			}
			new_ticket.fields.description = clean_string(ticket_description);
		}

		//console.log(new_ticket);

		var new_ticket_string = JSON.stringify(new_ticket);

		var new_ticket_req_options = {
			hostname: jira_hostname,
			port: 443,
			path: '/rest/api/2/issue',
			method: 'POST',
			auth: jira_auth,
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': new_ticket_string.length
			}
		};

		var new_ticket_req = https.request(new_ticket_req_options, function(res) {
			var data = '';
			res.on('data', function(d) {
				data += d;
			});
			res.on('end', function() {
				var ticket_info = JSON.parse(data);
				if (ticket_info.errorMessages !== undefined) {
					say('Error creating ticket! Oh no! ' + ticket_info.errorMessages.join(', ') + '!', where);
				} else {
					set_ticket_submitter(ticket_info.key, username_from_email);
					if (ticket_description !== undefined) {
						say('Ticket created, check out '+jira_browse_url+ticket_info.key+' to fill it out more.', where);
					} else {
						say('Ticket created, check out '+jira_browse_url+ticket_info.key+' to fill it out more. Please add a description!', where);
					}
				}
			});
		});

		new_ticket_req.on('error', function(e) {
			console.error('problem with new ticket request: ' + e.message);
		});

		new_ticket_req.write(new_ticket_string); // send along POST data
		new_ticket_req.end(); // engage!

		return;
	}

}

// start by getting team keys
get_team_keys();
setInterval(get_team_keys, 3600000); // regenerate teams every hour

// actually log in and connect!
slack.login();
