require('dotenv').config();
const { Kafka } = require('kafkajs');
const winston = require('winston');
const axios = require('axios');
const NodeCache = require('node-cache');

// Initialize logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// Initialize cache
const cache = new NodeCache({
  stdTTL: 300,
  checkperiod: 120
});

// Initialize Kafka
const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'kafka-consumer',
  brokers: [process.env.KAFKA_BROKER || 'localhost:29092']
});

// Configure consumers for different topics
const hostnameRequestConsumer = kafka.consumer({ 
  groupId: `${process.env.KAFKA_GROUP_ID || 'kafka-consumer-group'}-hostname-requests`
});

const ipRequestConsumer = kafka.consumer({ 
  groupId: `${process.env.KAFKA_GROUP_ID || 'kafka-consumer-group'}-ip-requests`
});

const userActivityConsumer = kafka.consumer({ 
  groupId: `${process.env.KAFKA_GROUP_ID || 'kafka-consumer-group'}-user-activity`
});

// Producer for responses
const producer = kafka.producer();

// Create API clients for services
const proxmoxServiceUrl = process.env.PROXMOX_SERVICE_URL || 'http://localhost:8002';
const ipamServiceUrl = process.env.IPAM_SERVICE_URL || 'http://localhost:8003';

/**
 * Process hostname requests
 * @param {Object} message - Kafka message
 */
async function processHostnameRequest(message) {
  try {
    const request = JSON.parse(message.value.toString());
    logger.info(`Processing hostname request: ${JSON.stringify(request)}`);
    
    if (!request.hostname) {
      logger.error('Invalid hostname request: missing hostname');
      return;
    }
    
    // Call ProxMox service to check hostname
    const response = await axios.post(`${proxmoxServiceUrl}/proxmox/check-hostname`, {
      hostname: request.hostname,
      prefix: request.prefix
    });
    
    // Send response back to Kafka
    await producer.send({
      topic: process.env.KAFKA_TOPIC_HOSTNAME_RESPONSE || 'hostname-responses',
      messages: [
        {
          key: message.key,
          value: JSON.stringify({
            requestId: request.requestId,
            hostname: request.hostname,
            available: response.data.available,
            suggestions: response.data.suggestions || [],
            timestamp: new Date().toISOString()
          })
        }
      ]
    });
    
    logger.info(`Processed hostname request for ${request.hostname}: available=${response.data.available}`);
  } catch (error) {
    logger.error('Error processing hostname request', error);
  }
}

/**
 * Process IP address requests
 * @param {Object} message - Kafka message
 */
async function processIpRequest(message) {
  try {
    const request = JSON.parse(message.value.toString());
    logger.info(`Processing IP request: ${JSON.stringify(request)}`);
    
    if (!request.subnetId) {
      logger.error('Invalid IP request: missing subnetId');
      return;
    }
    
    let response;
    if (request.ip) {
      // Check specific IP
      response = await axios.post(`${ipamServiceUrl}/ipam/check-ip`, {
        ip: request.ip,
        subnetId: request.subnetId
      });
    } else {
      // Get next available IP
      response = await axios.post(`${ipamServiceUrl}/ipam/next-available`, {
        subnetId: request.subnetId
      });
    }
    
    // Send response back to Kafka
    await producer.send({
      topic: process.env.KAFKA_TOPIC_IP_RESPONSE || 'ip-responses',
      messages: [
        {
          key: message.key,
          value: JSON.stringify({
            requestId: request.requestId,
            subnetId: request.subnetId,
            ip: request.ip || response.data.ip,
            available: response.data.available !== undefined ? response.data.available : true,
            timestamp: new Date().toISOString()
          })
        }
      ]
    });
    
    logger.info(`Processed IP request for subnet ${request.subnetId}`);
  } catch (error) {
    logger.error('Error processing IP request', error);
  }
}

/**
 * Process user activity events
 * @param {Object} message - Kafka message
 */
async function processUserActivity(message) {
  try {
    const activity = JSON.parse(message.value.toString());
    logger.info(`User activity: ${activity.action} by ${activity.userId}`);
    
    // Here you could store activity logs, trigger notifications, etc.
    // For demonstration, we just log it
  } catch (error) {
    logger.error('Error processing user activity', error);
  }
}

/**
 * Setup and run the Kafka consumers
 */
async function run() {
  try {
    // Connect producer
    await producer.connect();
    logger.info('Connected to Kafka producer');
    
    // Setup hostname request consumer
    await hostnameRequestConsumer.connect();
    await hostnameRequestConsumer.subscribe({
      topic: process.env.KAFKA_TOPIC_HOSTNAME_REQUEST || 'hostname-requests',
      fromBeginning: false
    });
    
    await hostnameRequestConsumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        await processHostnameRequest(message);
      }
    });
    
    logger.info('Hostname request consumer started');
    
    // Setup IP request consumer
    await ipRequestConsumer.connect();
    await ipRequestConsumer.subscribe({
      topic: process.env.KAFKA_TOPIC_IP_REQUEST || 'ip-requests',
      fromBeginning: false
    });
    
    await ipRequestConsumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        await processIpRequest(message);
      }
    });
    
    logger.info('IP request consumer started');
    
    // Setup user activity consumer
    await userActivityConsumer.connect();
    await userActivityConsumer.subscribe({
      topic: process.env.KAFKA_TOPIC_USER_ACTIVITY || 'user-activity',
      fromBeginning: false
    });
    
    await userActivityConsumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        await processUserActivity(message);
      }
    });
    
    logger.info('User activity consumer started');
    
    logger.info('All Kafka consumers are running');
  } catch (error) {
    logger.error('Error running Kafka consumers', error);
    
    // Attempt to disconnect everything before exiting
    try {
      await hostnameRequestConsumer.disconnect();
      await ipRequestConsumer.disconnect();
      await userActivityConsumer.disconnect();
      await producer.disconnect();
    } catch (e) {
      logger.error('Error disconnecting Kafka clients', e);
    }
    
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  try {
    await hostnameRequestConsumer.disconnect();
    await ipRequestConsumer.disconnect();
    await userActivityConsumer.disconnect();
    await producer.disconnect();
    logger.info('Disconnected from Kafka');
  } catch (error) {
    logger.error('Error during shutdown', error);
  }
  
  process.exit(0);
});

// Start the consumer service
run().catch(error => {
  logger.error('Fatal error', error);
  process.exit(1);
});

logger.info('Kafka consumer service starting up');