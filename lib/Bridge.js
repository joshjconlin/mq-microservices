'use strict';
const amqp = require("amqplib/callback_api");
/*
* @type Action {
*   key: string;
*   verb: string; // get, post, put, delete
*   path: string;
* }
*
* @param config {
*   mqUrl: string;
*   queues: {
*       process: string;
*       success: string;
*       error: string;
*   }
*   serviceHost: string;
*   servicePort: string;
*   serviceStage: string;
*   actions: Action[];
*   startCommand?: string; // default serverless offline
* }
*
* */

//'amqp://localhost'
class Bridge {
    constructor(config) {
        this.config = config;
        this.ready = false;
        this.connection = null;
        this.channel = null;
    }

    /*
    * @param queue: string;
    * @param message {
    *   id: string;
    *   action: string;
    *   data?: any;
    *   error?: string;
    * }
    * */
    _sendToQueue = (queue, message) => {
        this.channel.assertQueue(queue, {
            durable: true,
        });

        const packet = JSON.stringify(message);

        this.channel.sendToQueue(queue, Buffer.from(packet));

        console.log(`Message: %s, sent to queue: ${queue}`, message);
    };

    /*
    * @param message {
    *   id: string;
    *   action: string;
    *   data?: any
    *   error?: string;
    * }
    * */
    _handleMessage = async (message) => {
        const errorQueue = this.config.queues.error;
        const successQueue = this.config.queues.success;
        const actions = this.config.actions;

        const action = actions.find(action => action.key === message.action);

        try {
            if (!this.ready) {
                throw Error(`Bridge is not initialized.`);
            }
            if (!action) {
                throw Error(`Action: ${action} not found.`);
            }

            const { verb, path } = action;

            const send = axios[verb];

            const url = `${this.config.serviceHost}:${this.config.servicePort}/${this.config.serviceStage}/${path}`;

            const useBody = verb === 'post' || verb === 'put';

            const response = await send(url, useBody ? message.data : undefined);

            const { data } = response;

            this._sendToQueue(successQueue, {
                id: message.id,
                action: message.action,
                data
            });
        } catch (error) {
            this._sendToQueue(errorQueue, {
                id: message.id,
                action: message.action,
                data: message.data,
                error: error.message || error,
            })
        }
    };

    _connect = async () => {
        return new Promise((resolve, reject) => {
            console.log('Starting connection...');
            // todo: figure this out for docker container - plextracmq
            amqp.connect(this.config.mqUrl, (error, connection) => {
                if (error) {
                    console.log(`Unable to connect to queue: ${error}`)
                    return reject(error);
                }

                console.log('Rabbit MQ connected!');
                this.connection = connection;
                return resolve(connection);
            });
        });
    };

    _createChannel = async () => {
        console.log(`Opening channel...`);
        return new Promise((resolve, reject) => {
            this.connection.createChannel((error, channel) => {
                if (error) {
                    console.log(`Error opening channel: ${error}`);
                    return reject(error);
                }

                console.log('Channel connected!')
                this.channel = channel;
                return resolve(channel);
            })
        });
    };

    _consumeMessageChannel = async () => {
        console.log('consuming channel');
        const queue = this.config.queues.process;

        this.channel.assertQueue(queue, {
            durable: true,
        });

        this.channel.consume(queue, function (msg) {
            const message = msg.content.toString();

            this._handleMessage(message);

        }, {
            noAck: true
        });

        this.ready = true;
    };

    _startServerless = () => {
        const child = exec(this.config.startCommand ? this.config.startCommand : 'serverless offline');

        // @ts-ignore
        child.stdout.pipe(process.stdout);

        child.on('exit', function () {
            process.exit()
        });

        console.log('Ready');
    };

    initialize = async () => {
        await this._connect()
            .then(this._createChannel)
            .then(this._consumeMessageChannel)
            .then(this._startServerless)
    };

}

module.exports = Bridge;
