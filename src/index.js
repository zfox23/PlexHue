const express = require('express');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const config = require(`../config.json`);

const HueController = require('./HueController');
const hueController = new HueController();

const app = express();

app.post('/', upload.single('thumb'), (req, res) => {
    let payload = JSON.parse(req.body.payload);

    if (config.VALID_PLAYER_NAMES.indexOf(payload.Player.title) === -1 || config.VALID_MEDIA_TYPES.indexOf(payload.Metadata.type) === -1) {
        return;
    }

    switch (payload.event) {
        case "media.play":
        case "media.resume":
        case "media.pause":
        case "media.stop":
            hueController.onStateChange(payload.event);
            break;
        default:
            break;
    }
});

app.listen(config.PLEXHUE_PORT, () => {
    console.log(`PlexHue listening at http://localhost:${config.PLEXHUE_PORT}`);
});
