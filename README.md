##Simple Setup Tool for Serverless Microservices powered by rabbit mq

### Install
`npm i --save --dev mq-microservices`

###Assumptions
   RabbitMQ installed
   
### Usage
`node ./node_modules/mq-microservices/lib/CreateService --language {LANGUAGE}`
 
 Edit serverless.yml functions to add additional routes, and then add handler function to handler file
 
### Supported Language Options
typescript,
javascript,
python3,
nodejs,
js,
go
