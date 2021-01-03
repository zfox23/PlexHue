const express = require('express');
const multer = require('multer');
const upload = multer();
const config = require(`../config.json`);

const HueController = require('./HueController');
const hueController = new HueController();

const app = express();

// We use `upload.none()` here because we don't care about the thumbnail file
// contained within the Plex Webhook request.
app.post('/', upload.none(), (req, res) => {
    let payload = JSON.parse(req.body.payload);

    if (!config.VALID_PLAYER_NAMES.includes(payload.Player.title) || payload.Metadata.type !== 'movie') {
        return;
    }

    switch (payload.event) {
        case "media.play":
        case "media.resume":
            hueController.onPlay();
            break;
        case "media.pause":
            hueController.onPause();
            break;
        case "media.stop":
            hueController.onStop();
            break;
        default:
            break;
    }
});

app.listen(config.PORT, () => {
    console.log(`PlexHue listening at http://localhost:${config.PORT}`);
});