'use strict';

const chalk = require('chalk');

const echo = (message, level = 0, wrapper = null, asString = false) => {
    let output;
    if (typeof message === 'string') {
        const string = '  '.repeat(level) + message;
        output = wrapper ? wrapper(string) : string;
    } else {
        output = message;
    }

    if (asString) {
        return output;
    }

    console.log(output);
};

const danger = (message, level = 0, asString = false) => {
    return echo(message, level, chalk.red, asString);
};

const success = (message, level = 0, asString = false) => {
    return echo(message, level, chalk.green, asString);
};

const warning = (message, level = 0, asString = false) => {
    return echo(message, level, chalk.yellow, asString);
};

const notice = (message, level = 0, asString = false) => {
    return echo(message, level, chalk.blue, asString);
};

const info = (message, level = 0, asString = false) => {
    return echo(message, level, null, asString);
};

const line =(asString = false) => {
    return echo('', 0, null, asString);
};

module.exports = {
    echo,
    line,
    info,
    notice,
    warning,
    danger,
    success
};
