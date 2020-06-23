'use strict';

const readlineSync = require('readline-sync');
const exec = require('child_process').exec;
const log = require('./log');


const noOp = () => {
    //
};

module.exports = {
    executeCommand(command) {
        return new Promise((resolve, reject) => {
            const child = exec(command);

            child.stdout.pipe(process.stdout);

            process.stdin.pipe(child.stdin);

            child.on('error', () => {
                reject();
                process.exit();
            });

            child.on('exit', function () {
                resolve()
            });
        });
    },

    formattedLog(text, type, topSpace = true, bottomSpace = true, level = 0) {
        const execute = log[type];

        if (topSpace) {
            log.line();
        }

        execute(text, level);

        if (bottomSpace) {
            log.line();
        }
    },

    handleAnswer(answer = '', confirmedText = 'y', resolve = noOp, reject = noOp, rejectError = 'Process Cancelled.') {
        if (answer === confirmedText) {
            return resolve();
        }

        return reject(rejectError);
    },

    handleQuestion(message, level = 1, asString = true) {
        const question = log.danger(message, level, asString);

        const answer = readlineSync.question(question).toLowerCase();

        log.line();

        return answer;
    },

};
