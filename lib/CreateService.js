'use strict';
const {argv} = require('yargs');
const utils = require('./util/utils');
const templates = require('./templates');

//template aws-nodejs
// aws-python3
// aws-go
const getTemplate = () => {
    const language = argv.language;
    const options = ['typescript', 'javascript', 'python3', 'nodejs', 'js', 'go'];

    if (!language || language === 'typescript' || !options.includes(language)) {
        if (language !== 'typescript') {
            console.log('No supported language specified, defaulting to typescript');
        }
        return 'aws-nodejs-typescript';
    }

    if (language === 'nodejs' || language === 'js') {
        return 'aws-nodejs';
    }

    if (language === 'go') {
        return 'aws-go';
    }

    if (language === 'python3') {
        return 'aws-python3';
    }
}

const createDir = async () => {
    return new Promise((resolve, reject) => {
        const message = 'Please enter the relative directory you wish to create the service in. '
        const answer = utils.handleQuestion(message);

        utils.executeCommand(`mkdir ${answer}`)
            .then(() => {
                resolve(answer);
            })
            .catch(reject);
    });
}

const createServerless = (directory) => {
    return new Promise((resolve, reject) => {
        utils.executeCommand(`cd ${directory} && serverless create --template ${getTemplate()}`)// create --template-path . && serverless plugin install serverless-offline
            .then(() => {
                return utils.executeCommand(`cd ${directory} && rm -rf ./vscode`);
            })
            .then(async () => {
                const queueName = utils.handleQuestion(`What is the base name of the queues you will be using? i.e. integration. `);
                const service = utils.handleQuestion(`What is the stage name you chose during setup? Typically this is the name of the folder you created. `);

                let MQ_URL = utils.handleQuestion(`Enter the address to use for your mq url. If use default (amqp://localhost) (Press Enter) `);

                if (MQ_URL === '') {
                    MQ_URL = 'amqp://localhost';
                }

                let SERVICE_HOST = utils.handleQuestion(`What is the host you wish to use? For docker use '0.0.0.0'. (Press Enter) `);

                if (SERVICE_HOST === '') {
                    SERVICE_HOST = 'http://0.0.0.0';
                }

                let PERFORM_AUTH = true;
                let MQ_USER = '';
                let MQ_PASS = '';
                let SHOULD_PERFORM_AUTH = utils.handleQuestion(`Does your message broker require authentication?  (If not press enter) `);

                if (SHOULD_PERFORM_AUTH === '') {
                    PERFORM_AUTH = false;
                }

                if (PERFORM_AUTH === true) {
                    MQ_USER = utils.handleQuestion(`Please provide your message broker's username.  (Press enter) `);
                    MQ_PASS = utils.handleQuestion(`Please enter your message broker's password.  (Press enter) `);
                    if (MQ_USER === '' || MQ_PASS === '') {
                        throw 'Authentication enabled but user/password are undefined.';
                    }
                }

                const SERVICE_PORT = utils.handleQuestion(`What port should the service run on? `);

                await utils.executeCommand(`cd ${directory} && mkdir src`);

                await utils.executeCommand(`cd ${directory} && mv ./handler.* ./src`);

                templates.createIndexJs(directory, queueName, service);

                templates.createEnv(directory, MQ_URL, SERVICE_HOST, SERVICE_PORT, PERFORM_AUTH, MQ_USER, MQ_PASS);

                templates.updateServerlessYml(directory, service, SERVICE_HOST, SERVICE_PORT, argv.language === 'go');

                templates.correctGitIgnore(directory);

                if (argv.language !== '' && argv.language !== 'typescript') {
                    await utils.executeCommand(`cd ${directory} && npm init`);
                }

                templates.addDependencies(directory);

                templates.addNodemon(directory)

                templates.addDockerFile(directory);
            })
            .then(() => {
                console.log('installing dependencies...');
                return utils.executeCommand(`cd ${directory} && npm i`);
            })
            .then(resolve)
            .catch(reject);
    });
}

const run = () => {
    createDir()
        .then(createServerless)
        .then(() => {
            console.log(`Service created successfully!`);
            process.exit();
        })
        .catch(process.exit);
}

run();
