'use strict';
const amqp = require('amqplib/callback_api');
const axios = require('axios');
const exec = require('child_process').exec;
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
*       dead: string;
*   }
*   serviceHost: string;
*   servicePort: string;
*   serviceStage: string;
*   actions: Action[];
*   startCommand?: string; // default serverless offline
* }
*
* */

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

    _retriable = (func, retries, message, deadQueue = '') => {
        return async () => {
            if (retries === 0) {
                return await func();
            }

            const range = [];

            for(let i = 1; i<= retries; i++) {
                range.push(i);
            }

            let response = null;

            for await (let count of range) {
                try {
                    response = await func();
                    break;
                } catch (error) {
                    console.log('error', error);
                    if (count === retries) {
                        if (deadQueue) {
                            this._sendToQueue(deadQueue, {
                                id: message.id,
                                action: message.action,
                                data: message.data,
                                error: error.message || error
                            })
                        }

                        throw Error('all retries failed');
                    }
                }
            }

            return response;
        }
    }
    /*
   * @param action {
   *    verb: string;
   *    path: string;
   * }
   *
   * @param message {
   *   id: string;
   *   action: string;
   *   data?: any
   *   error?: string;
   *   needsResponse?: boolean = true;
   *   needsError?: boolean = true;
   *   retries?: number = 0;
   * }
   * */
    _handleService = async (action, message) => {
        const errorQueue = this.config.queues.error;
        const successQueue = this.config.queues.success;
        const deadQueue = this.config.queues.dead || '';

        const retries = message.retries || 0;
        const needsResponse = typeof message.needsResponse !== 'undefined' ? message.needsResponse : true;
        const needsError = typeof message.needsError !== 'undefined' ? message.needsError : true;

        try {

            const { verb, path } = action;

            const send = axios[verb];

            const url = `${this.config.serviceHost}:${this.config.servicePort}/${this.config.serviceStage}/${path}`;

            const useBody = verb === 'post' || verb === 'put';

            const response = await this._retriable(async () => await send(url, useBody ? message.data : undefined), retries, message, deadQueue)();

            const { data } = response;

            console.log(`message processed, results:`, data);

            if (needsResponse) {
                this._sendToQueue(successQueue, {
                    id: message.id,
                    action: message.action,
                    data
                });
            }
        } catch (error) {
            console.log(error, 'error');
            if (needsError && error.message !== 'all retries failed') {
                this._sendToQueue(errorQueue, {
                    id: message.id,
                    action: message.action,
                    data: message.data,
                    error: error.message || error,
                })
            }
        }
    };

    /*
    * @param message {
    *   id: string;
    *   action: string;
    *   data?: any
    *   error?: string;
    *   needsResponse?: boolean = true;
    *   needsError?: boolean = true;
    *   retries?: number = 0;
    * }
    * */
    _handleMessage = async (message) => {
        const actions = this.config.actions;

        const action = actions.find(action => action.key === message.action);

        if (!this.ready) {
            throw Error(`Bridge is not initialized.`);
        }
        if (!action) {
            console.log(`Action: ${message.action} not found. Nothing processed.`);
            return;
        }

        await this._handleService(action, message);
    };

    _connect = async () => {
        return new Promise((resolve, reject) => {
            console.log('Starting connection...');
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

        const handleMessage = this._handleMessage;

        this.channel.consume(queue, function (msg) {
            const message = JSON.parse(msg.content.toString());

            handleMessage(message);

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
