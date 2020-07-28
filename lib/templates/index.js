const fs = require('fs');
const yaml = require('js-yaml');
const YAML = require('json-to-pretty-yaml');

module.exports.createIndexJs = (directory, queueBase, stage) => {
  const template = `
const { config } = require('dotenv');
config();
const { Bridge } = require('mq-microservices');

const messageQueue = '${queueBase}';
const successQueue = '${queueBase}-success';
const errorQueue = '${queueBase}-error';
const deadQueue = '${queueBase}-dead';

const service = new Bridge({
  mqUrl: process.env.MQ_URL ?? 'localhost',
  performAuth: process.env.PERFORM_AUTH ?? false,
  rmqConfig: {
    protocol: 'amqp',
    hostname: this.mqUrl,
    port: 5672,
    username: process.env.MQ_USER ?? 'user',
    password: process.env.MQ_PASS ?? 'user',
    vhost: '/',
    authMechanism: ['AMQPLAIN']
  },
  queues: {
    process: messageQueue,
    success: successQueue,
    error: errorQueue,
    dead: deadQueue,
  },
  serviceHost: process.env.SERVICE_HOST,
  servicePort: process.env.SERVICE_PORT,
  serviceStage: '${stage}',
  actions: [
        {
            key: 'hello',
            verb: 'get',
            path: 'hello',
        }
    ],
  startCommand: 'serverless offline',
});

service.initialize();`;

  fs.writeFileSync(`${directory}/index.js`, template);
};

module.exports.createEnv = (directory, mqUrl, serviceHost, servicePort, performAuth, rmqUser, rmqPass) => {
  const template = `MQ_URL=${mqUrl}
SERVICE_HOST=${serviceHost}
SERVICE_PORT=${servicePort}
PERFORM_AUTH=${performAuth}
MQ_USER=${rmqUser}
MQ_PASS=${rmqPass}
PERFORM_AUTH=${performAuth}
`;

  fs.writeFileSync(`${directory}/.env`, template);
  fs.writeFileSync(`${directory}/.env.example`, template);
};

module.exports.updateServerlessYml = (directory, service, serviceHost, servicePort, dontMoveHandler = false) => {
  const doc = yaml.safeLoad(fs.readFileSync(`${directory}/serverless.yml`, 'utf8'));

  if (!dontMoveHandler) {
    doc.functions.hello.handler = 'src/handler.hello';
  }

  doc.provider.stage = service

  doc.custom = {
    'serverless-offline': {
      host: serviceHost,
      httpPort: servicePort,
    },
  };

  if (!doc.plugins) {
    doc.plugins = [];
  }

  doc.plugins.push('serverless-offline');

  const data = YAML.stringify(doc);

  fs.writeFileSync(`${directory}/serverless.yml`, data);
};

module.exports.correctGitIgnore = (directory) => {
  let text = fs.readFileSync(`${directory}/.gitignore`, 'utf-8');

  text = text.concat(`
  `);

  text = text.concat(`
.idea
.vscode`);

  fs.writeFileSync(`${directory}/.gitignore`, text);
};

module.exports.addDependencies = (directory) => {
  let packageJsonString = fs.readFileSync(`${directory}/package.json`, 'utf-8');
  packageJsonString = packageJsonString.replace('/^/g', '');

  const json = JSON.parse(packageJsonString);
  const packageJson = require('../../package.json');
  const { version } = packageJson;

  if (!json.dependencies) {
    json.dependencies = {};
  }

  json.scripts = {
    "dev": "nodemon",
    "start": "node ./index.js"
  };

  json.dependencies['serverless'] = '1.73.1';

  json.dependencies['serverless-offline'] = '6.4.0';

  json.dependencies["mq-microservices"] = version;

  if (!json.devDependencies) {
    json.devDependencies = {};
  }

  json.devDependencies['nodemon'] = '2.0.4';

  fs.writeFileSync(`${directory}/package.json`, JSON.stringify(json, null, 2));
};

module.exports.addNodemon = (directory) => {
  const template = `{
  "watch": ["src/**/*", "./**/*"],
  "exec": "node ./index.js"
}
`;

  fs.writeFileSync(`${directory}/nodemon.json`, template);
};

module.exports.addDockerFile = (directory, serviceStage) => {
  const template = `FROM node:14.5.0

RUN mkdir -p /usr/src/${serviceStage}-service
WORKDIR /usr/src/${serviceStage}-service

COPY package.json /usr/src/${serviceStage}-service

RUN npm install

COPY . /usr/src/${serviceStage}-service

CMD ["npm", "start"]
  `;

  fs.writeFileSync(`${directory}/Dockerfile`, template);
};
