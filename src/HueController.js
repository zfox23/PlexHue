const http = require('http');
const fs = require('fs');
const CONFIG_FILENAME = 'config.json';
// Path is relative to `<PlexHue root>/src/` directory.
const config = require(`../${CONFIG_FILENAME}`);
const UNAUTHENTICATED_TIMEOUT_MS = 5000;

class HueController {
    constructor() {
        this.bridgeAddress = config.HUE_BRIDGE_IP_ADDRESS;
        this.apiUsername = config.API_USERNAME;
        this.lightGroupNameToControl = config.LIGHT_GROUP_NAME_TO_CONTROL;
        this.lightNamesToControl = config.LIGHT_NAMES_TO_CONTROL;
        this.lightIDsToControl = [];
        this.scenes = {};

        this.authenticated = false;

        this.testAuthentication();
    }

    handleUnauthenticated() {
        const postData = JSON.stringify({
            "devicetype": "PlexHue#PlexHueUser"
        });

        const options = {
            hostname: this.bridgeAddress,
            path: "/api",
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': postData.length
            }
        };

        const req = http.request(options, (res) => {
            const { statusCode } = res;

            let error;
            if (statusCode !== 200) {
                error = new Error(`Error when sending POST request during \`handleUnauthenticated()\`! Status code: ${statusCode}`);
            }

            if (error) {
                console.error(error.message);
                // Consume response data to free up memory
                res.resume();
                return;
            }

            res.setEncoding('utf8');
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(rawData);
                    if (parsedData[0] && parsedData[0].error && parsedData[0].error.type === 101) {
                        console.log(`Please press the Link button on your Philips Hue Bridge. We will attempt to re-authorize in five seconds...`);
                        setTimeout(() => {
                            this.handleUnauthenticated();
                        }, UNAUTHENTICATED_TIMEOUT_MS);
                    } else if (parsedData[0] && parsedData[0].success && parsedData[0].success.username) {
                        console.log(`Successfully created a new API user on Bridge device! Writing new configuration file which contains that username...`);
                        this.apiUsername = parsedData[0].success.username;
                        // Path is relative to `<PlexHue root>/` directory.
                        let currentConfig = fs.readFileSync(`./${CONFIG_FILENAME}`);
                        let currentConfigJSON = JSON.parse(currentConfig);
                        currentConfigJSON["API_USERNAME"] = parsedData[0].success.username;

                        fs.writeFileSync(`./${CONFIG_FILENAME}`, JSON.stringify(currentConfigJSON, null, 4));

                        this.testAuthentication();
                    } else {
                        console.error(`\`testAuthentication()\`: Unhandled response from Hue Bridge:\n${JSON.stringify(parsedData)}`);
                    }
                } catch (e) {
                    console.error(`\`handleUnauthenticated()\`: Error when parsing response from Hue Bridge:\n${e.message}`);
                }
            });
        });

        req.on('error', (error) => {
            console.error(`Error when sending POST request during \`handleUnauthenticated()\`! Error:\n${error}`);
        });

        req.write(postData);
        req.end();
    }

    getLightInfo(parsedData) {
        let discoveredLightNamesToControl = [];

        if (this.lightGroupNameToControl && parsedData.groups) {
            console.log(`You have configured PlexHue to control lights in the group named "${this.lightGroupNameToControl}".`)

            let keys = Object.keys(parsedData.groups);
            for (let i = 0; i < keys.length; i++) {
                if (parsedData.groups[keys[i]].name === this.lightGroupNameToControl) {
                    let groupLightIDs = parsedData.groups[keys[i]].lights;
                    for (let j = 0; j < groupLightIDs.length; j++) {
                        this.lightIDsToControl.push(groupLightIDs[j]);
                        discoveredLightNamesToControl.push(parsedData.lights[groupLightIDs[j]].name);
                    }
                    break;
                }
            }

            if (!this.lightIDsToControl) {
                console.error(`There are no lights in the group "${this.lightGroupNameToControl}", or that group name could not be found.\nPlease check \`${CONFIG_FILENAME}\` and ensure the value for \`LIGHT_GROUP_NAME_TO_CONTROL\` is valid.`);
                return;
            }
        } else if (this.lightNamesToControl && !this.lightGroupNameToControl && parsedData.lights) {
            console.log(`You have configured PlexHue to control lights named "${this.lightNamesToControl.join(", ")}".`)

            let keys = Object.keys(parsedData.lights);
            for (let i = 0; i < this.lightNamesToControl.length; i++) {
                let found = false;

                for (let j = 0; j < keys.length; j++) {
                    if (this.lightNamesToControl[i] === parsedData.lights[keys[j]].name) {
                        this.lightIDsToControl.push(keys[i]);
                        discoveredLightNamesToControl.push(parsedData.lights[keys[i]].name);
                        found = true;
                        break;
                    }
                }

                if (!found) {
                    console.error(`We couldn't find a light with the name "${this.lightNamesToControl[i]}", so PlexHue won't control that light.`);
                }
            }
        }

        if (this.lightIDsToControl.length > 0) {
            console.log(`PlexHue will control the following Hue lights:\n${discoveredLightNamesToControl.join(", ")}`);
        } else {
            console.error(`There are no valid lights for PlexHue to control.\nPlease check \`${CONFIG_FILENAME}\` and ensure that you have set either \`LIGHT_GROUP_NAME_TO_CONTROL\` or \`LIGHT_NAMES_TO_CONTROL\`.`);
        }
    }

    getSceneInfo(sceneID) {
        const options = {
            hostname: this.bridgeAddress,
            path: `/api/${this.apiUsername}/scenes/${sceneID}`
        };

        http.get(options, (res) => {
            const { statusCode } = res;
            const contentType = res.headers['content-type'];

            let error;
            if (statusCode !== 200) {
                error = new Error(`Error when contacting Hue Bridge! Status code: ${statusCode}`);
            } else if (!/^application\/json/.test(contentType)) {
                error = new Error(`Error when contacting Hue Bridge! Invalid \`content-type\`.\nExpected \`application/json\` but received \`${contentType}\``);
            }

            if (error) {
                console.error(error.message);
                // Consume response data to free up memory
                res.resume();
                return;
            }

            res.setEncoding('utf8');
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(rawData);
                    if (parsedData[0] && parsedData[0].error) {
                        console.error(`\`getSceneInfo()\`: Got error from Hue Bridge:\n${JSON.stringify(parsedData)}`);
                    } else {
                        console.log(`Got scene info for scene named ${parsedData.name}!`);
                        this.scenes[parsedData.name] = {
                            "lights": parsedData.lights,
                            "lightstates": parsedData.lightstates
                        };
                    }
                } catch (e) {
                    console.error(`\`getSceneInfo()\`: Error when parsing response from Hue Bridge:\n${e.message}`);
                }
            });
        });
    }

    getAllScenes() {
        const options = {
            hostname: this.bridgeAddress,
            path: `/api/${this.apiUsername}/scenes`
        };

        http.get(options, (res) => {
            const { statusCode } = res;
            const contentType = res.headers['content-type'];

            let error;
            if (statusCode !== 200) {
                error = new Error(`Error when contacting Hue Bridge! Status code: ${statusCode}`);
            } else if (!/^application\/json/.test(contentType)) {
                error = new Error(`Error when contacting Hue Bridge! Invalid \`content-type\`.\nExpected \`application/json\` but received \`${contentType}\``);
            }

            if (error) {
                console.error(error.message);
                // Consume response data to free up memory
                res.resume();
                return;
            }

            res.setEncoding('utf8');
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(rawData);
                    if (parsedData[0] && parsedData[0].error) {
                        console.error(`\`getAllScenes()\`: Got error from Hue Bridge:\n${JSON.stringify(parsedData)}`);
                    } else if (Object.keys(parsedData).length > 0) {
                        let keys = Object.keys(parsedData);
                        for (let i = 0; i < keys.length; i++) {
                            console.log(`Getting scene info for Scene ID \`${keys[i]}\`...`);
                            this.getSceneInfo(keys[i]);
                        }
                    } else if (Object.keys(parsedData).length === 0) {
                        console.log(`There are no scenes set up on this Hue Bridge. Scene support disabled.`);
                    } else {
                        console.error(`\`getAllScenes()\`: Unhandled response from Hue Bridge:\n${JSON.stringify(parsedData)}`);
                    }
                } catch (e) {
                    console.error(`\`getAllScenes()\`: Error when parsing response from Hue Bridge:\n${e.message}`);
                }
            });
        });
    }

    testAuthentication() {
        const options = {
            hostname: this.bridgeAddress,
            path: `/api/${this.apiUsername}`
        };

        http.get(options, (res) => {
            const { statusCode } = res;
            const contentType = res.headers['content-type'];

            let error;
            if (statusCode !== 200) {
                error = new Error(`Error when contacting Hue Bridge! Status code: ${statusCode}`);
            } else if (!/^application\/json/.test(contentType)) {
                error = new Error(`Error when contacting Hue Bridge! Invalid \`content-type\`.\nExpected \`application/json\` but received \`${contentType}\``);
            }

            if (error) {
                console.error(error.message);
                // Consume response data to free up memory
                res.resume();
                return;
            }

            res.setEncoding('utf8');
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(rawData);
                    if (parsedData[0] && parsedData[0].error && parsedData[0].error.type === 1) {
                        this.handleUnauthenticated();
                    } else if (parsedData.lights) {
                        this.authenticated = true;
                        console.log(`Successfully authenticated with Hue Bridge!`);
                        this.getLightInfo(parsedData);
                        this.getAllScenes();
                    } else {
                        console.error(`\`testAuthentication()\`: Unhandled response from Hue Bridge:\n${JSON.stringify(parsedData)}`);
                    }
                } catch (e) {
                    console.error(`\`testAuthentication()\`: Error when parsing response from Hue Bridge:\n${e.message}`);
                }
            });
        });
    }

    hueAPIPutRequest(endpoint, data) {
        const putData = JSON.stringify(data);

        const options = {
            hostname: this.bridgeAddress,
            path: `/api/${this.apiUsername}/${endpoint}`,
            method: 'put',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': putData.length
            }
        };

        const req = http.request(options, (res) => {
            const { statusCode } = res;

            let error;
            if (statusCode !== 200) {
                error = new Error(`Error when sending POST request! Status code: ${statusCode}`);
            }

            if (error) {
                console.error(error.message);
                // Consume response data to free up memory
                res.resume();
                return;
            }

            res.setEncoding('utf8');
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(rawData);
                    if (parsedData[0] && parsedData[0].success) {
                        // NOP
                    } else {
                        console.error(`Unhandled response from Hue Bridge:\n${JSON.stringify(parsedData)}`);
                    }
                } catch (e) {
                    console.error(`Error when parsing response from Hue Bridge:\n${e.message}`);
                }
            });
        });

        req.on('error', (error) => {
            console.error(`Error when sending POST request! Error:\n${error}`);
        });

        req.write(putData);
        req.end();
    }

    onStateChange(stateName) {
        if (!this.authenticated) {
            console.warn(`State changed, but we weren't yet authenticated with the Hue Bridge.`);
            return;
        }

        console.log(`${Date.now()}: State changed to \`${stateName}\`.`);

        if (!config.PLAYBACK_STATES) {
            console.error(`\`config.PLAYBACK_STATES\` is not configured.`);
            return;
        }

        if (config.PLAYBACK_STATES && !config.PLAYBACK_STATES[stateName]) {
            console.warn(`This is an unhandled state.`);
            return;
        }

        if (config.PLAYBACK_STATES && config.PLAYBACK_STATES[stateName] && config.PLAYBACK_STATES[stateName].HUE_LIGHT_ON === false) {
            for (let i = 0; i < this.lightIDsToControl.length; i++) {
                console.log(`Turning off light with ID \`${this.lightIDsToControl[i]}\`...`);
                this.hueAPIPutRequest(`lights/${this.lightIDsToControl[i]}/state`, { "on": false });
            }
        } else if (config.PLAYBACK_STATES && config.PLAYBACK_STATES[stateName] && config.PLAYBACK_STATES[stateName].HUE_SCENE_NAME && this.scenes[config.PLAYBACK_STATES[stateName].HUE_SCENE_NAME]) {
            for (let i = 0; i < this.scenes[config.PLAYBACK_STATES[stateName].HUE_SCENE_NAME].lights.length; i++) {
                let modified = false;
                for (let j = 0; j < this.lightIDsToControl.length; j++) {
                    if (this.scenes[config.PLAYBACK_STATES[stateName].HUE_SCENE_NAME].lights[i] === this.lightIDsToControl[j]) {
                        modified = true;
                        console.log(`Modifying state of light with ID \`${this.lightIDsToControl[i]}\`...`);
                        this.hueAPIPutRequest(`lights/${this.lightIDsToControl[i]}/state`, this.scenes[config.PLAYBACK_STATES[stateName].HUE_SCENE_NAME].lightstates[this.lightIDsToControl[j]]);
                        break;
                    }
                }
                
                if (!modified) {
                    console.warn(`PlexHue is not configured to control light with ID \`${this.scenes[config.PLAYBACK_STATES[stateName].HUE_SCENE_NAME].lights[i]}\`, even though that light is set to be modified as part of the scene "${config.PLAYBACK_STATES[stateName].HUE_SCENE_NAME}".\nWe will not modify this light's state.`);
                }
            }
        } else if (config.PLAYBACK_STATES && config.PLAYBACK_STATES[stateName] && config.PLAYBACK_STATES[stateName].HUE_SCENE_NAME && !this.scenes[config.PLAYBACK_STATES[stateName].HUE_SCENE_NAME]) {
            console.error(`There is no scene information associated with the scene named "${config.PLAYBACK_STATES[stateName].HUE_SCENE_NAME}".`);
        } else {
            console.error(`\`config.PLAYBACK_STATES\` is not properly configured.`);
        }
    }
}

module.exports = HueController;
