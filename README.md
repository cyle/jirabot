# JIRAbot for Slack

## What is this thing?

This is a simple bot that lets you make JIRA issues via a commandline-like interface in Slack. Tell the bot to make a ticket, and it'll make the ticket. Cite a ticket ID, and the bot will give you a bit of info about it.

Correctly attributing the reporter of the issue back to who made the ticket in Slack requires that the email addresses in Slack match up to the ones used in JIRA, or else all of these tickets will be marked as reported by the bot.

This is known to work with JIRA v6.x.

## Installation

Go to your Custom Integrations page for your Slack instance and set up a new bot to be used for this. Copy the API key, you'll need it in a second.

Clone this repo!

Rename `config.sample.js` to `config.js` and edit it with your own config.

### Do the rest manually...

Make sure you have `node` and `npm` installed!

Run `npm install` inside this bot's directory to install dependencies.

Run `node /path/to/bot.js /path/to/config.js` to get it running.

### ... or with Docker

You can also use this with Docker! Go inside this bot's directory and run:

    docker build -t your-name/jirabot .
    docker run -d your-name/jirabot

Nice. That's it!

## Usage

First of all, invite the bot to whatever channel you'd like to make tickets in.

Here are the available commands:

- `.ticket` -- explain how to make a ticket
- `.ticket [team/project code] [issue summary] (=> [issue description])` -- create a ticket in project/team with summary, and if there's a `=>` and more, then add that as the ticket description. description is optional.
- `.ticket teams` -- list all project / team keys to use for making a ticket
- `.ticket retry teams` -- try to get the team codes from JIRA again (can also use "refresh" or "refetch")
- `.ticket team [name]` -- search for a team's code via a name or search term, i.e. `.team product search`
- `.ticket restart` -- restarts jirabot the hard way (can also use "kill" or "jirabot please restart")
- `TEAM-1234` -- if you provide a valid jira issue code (on its own, not a url), jirabot will fetch info about that issue and present it in the channel

## Examples

To make a new ticket in the "FYI" team/project:

    .ticket FYI this is a bad issue! => and here's a description

Or you can just add the title and fill in the description later:

    .ticket FYI some horrible bug i found

And if you want info about a specific ticket, say in slack something like:

    Thanks for fixing that bug, but what about FYI-1234?

The bot will detect `FYI-1234` and recognize that `FYI` is a JIRA project name and it'll attempt to look up the ticket and paste some info about it in the Slack channel.

That's it!
