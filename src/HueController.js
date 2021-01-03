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

    onPlay() {
        if (!this.authenticated) {
            return;
        }

        console.log(`${Date.now()}: \`onPlay()\` triggered.`);
        for (let i = 0; i < this.lightIDsToControl.length; i++) {
            this.hueAPIPutRequest(`lights/${this.lightIDsToControl[i]}/state`, { "on": false });
        }
    }

    onPause() {
        if (!this.authenticated) {
            return;
        }

        console.log(`${Date.now()}: \`onPause()\` triggered.`);
        for (let i = 0; i < this.lightIDsToControl.length; i++) {
            this.hueAPIPutRequest(`lights/${this.lightIDsToControl[i]}/state`, { "on": true });
        }
    }

    onStop() {
        if (!this.authenticated) {
            return;
        }

        console.log(`${Date.now()}: \`onStop()\` triggered.`);
        for (let i = 0; i < this.lightIDsToControl.length; i++) {
            this.hueAPIPutRequest(`lights/${this.lightIDsToControl[i]}/state`, { "on": true });
        }
    }
}

module.exports = HueController;