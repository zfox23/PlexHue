# PlexHue
Automatically modify the state of your Philips Hue lights upon certain Plex playback events. Requires a Plex Pass.

# Usage
1. Install [NodeJS v14.15.x](https://nodejs.org/en/)
2. Clone this repository to your local disk.
3. Copy `config.example.json` to `config.json`.
4. Modify `config.json` as you wish.
5. [Set up a Plex Webhook](https://app.plex.tv/desktop#!/settings/webhooks) to point to the server and port running PlexHue
  - i.e. Add a Webhook with URL `http://localhost:8085` if your Plex server is running on the same machine as PlexHue, and you're using the default PlexHue port of 8085.
6. Run `node .\index.js` and follow the instructions.

Enjoy!

# Automatic Launch on Startup (Windows)
If you'd like to have PlexHue start up when your Windows server starts up:
1. Install `pm2` with `npm i -g pm2`
2. `cd` into the PlexHue repo directory, type `pm2 start .\index.js`, and press enter.
3. Type `pm2 save` and press enter.
4. Type `npm install pm2-windows-startup -g` and press enter.
  - This installs the [`pm2-windows-startup`](https://www.npmjs.com/package/pm2-windows-startup) script locally.
5. Type `pm2-startup install` and press enter.
