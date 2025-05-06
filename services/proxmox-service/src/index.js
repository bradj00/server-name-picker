require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Kafka } = require('kafkajs');
const winston = require('winston');
const axios = require('axios');
const NodeCache = require('node-cache');
const rateLimit = require('express-rate-limit');

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

// Initialize Kafka
const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'proxmox-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:29092']
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: process.env.KAFKA_GROUP_ID || 'proxmox-service-group' });

// Initialize cache
const cache = new NodeCache({
  stdTTL: parseInt(process.env.CACHE_TTL) || 300,
  checkperiod: 120
});

// Initialize Express app
const app = express();
const port = process.env.PORT || 8002;

// Apply middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// Apply rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication token is required'
    });
  }
  
  // In a real application, you would verify the token
  // For simplicity, we're just checking if it exists
  next();
};

// Create the ProxMox API client
const proxmoxApi = axios.create({
  baseURL: process.env.PROXMOX_API_URL || 'https://proxmox.example.com/api2/json',
  headers: {
    'Authorization': `PVEAPIToken=${process.env.PROXMOX_API_TOKEN_NAME}=${process.env.PROXMOX_API_TOKEN_VALUE}`
  },
  validateStatus: (status) => status >= 200 && status < 300
});

if (process.env.PROXMOX_API_VERIFY_SSL === 'false') {
  proxmoxApi.defaults.httpsAgent = new (require('https').Agent)({ 
    rejectUnauthorized: false 
  });
}

/**
 * @route GET /proxmox/nodes
 * @desc Get list of ProxMox nodes
 * @access Private
 */
app.get('/proxmox/nodes', verifyToken, async (req, res) => {
  try {
    // Check cache first
    const cacheKey = 'proxmox_nodes';
    const cachedNodes = cache.get(cacheKey);
    
    if (cachedNodes) {
      logger.debug('Returning cached ProxMox nodes');
      return res.status(200).json(cachedNodes);
    }
    
    // Call ProxMox API
    const response = await proxmoxApi.get('/nodes');
    const nodes = response.data.data;
    
    // Cache the result
    cache.set(cacheKey, nodes);
    
    return res.status(200).json(nodes);
  } catch (error) {
    logger.error('Failed to get ProxMox nodes', error);
    
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get ProxMox nodes'
    });
  }
});

/**
 * @route GET /proxmox/vms
 * @desc Get list of VMs across all nodes
 * @access Private
 */
app.get('/proxmox/vms', verifyToken, async (req, res) => {
  try {
    // Check cache first
    const cacheKey = 'proxmox_vms';
    const cachedVms = cache.get(cacheKey);
    
    if (cachedVms) {
      logger.debug('Returning cached VMs');
      return res.status(200).json(cachedVms);
    }
    
    // Get nodes first
    const nodesResponse = await proxmoxApi.get('/nodes');
    const nodes = nodesResponse.data.data;
    
    // Get VMs for each node
    const vms = [];
    for (const node of nodes) {
      const vmsResponse = await proxmoxApi.get(`/nodes/${node.node}/qemu`);
      vms.push(...vmsResponse.data.data);
    }
    
    // Cache the result
    cache.set(cacheKey, vms);
    
    return res.status(200).json(vms);
  } catch (error) {
    logger.error('Failed to get VMs', error);
    
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get VMs'
    });
  }
});

/**
 * @route GET /proxmox/hosts
 * @desc Get list of hostnames in use
 * @access Private
 */
app.get('/proxmox/hosts', verifyToken, async (req, res) => {
  try {
    // Check cache first
    const cacheKey = 'proxmox_hosts';
    const cachedHosts = cache.get(cacheKey);
    
    if (cachedHosts) {
      logger.debug('Returning cached hosts');
      return res.status(200).json(cachedHosts);
    }
    
    // Get VMs first
    const vmsResponse = await proxmoxApi.get('/cluster/resources?type=vm');
    const vms = vmsResponse.data.data;
    
    // Extract hostnames
    const hosts = vms.map(vm => ({
      id: vm.vmid,
      name: vm.name,
      node: vm.node,
      status: vm.status
    }));
    
    // Cache the result
    cache.set(cacheKey, hosts);
    
    return res.status(200).json(hosts);
  } catch (error) {
    logger.error('Failed to get hosts', error);
    
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get hosts'
    });
  }
});

/**
 * @route POST /proxmox/check-hostname
 * @desc Check if hostname is available
 * @access Private
 */
app.post('/proxmox/check-hostname', verifyToken, async (req, res) => {
  try {
    const { hostname, prefix } = req.body;
    
    if (!hostname) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Hostname is required'
      });
    }
    
    // Get hosts first
    const hostsResponse = await proxmoxApi.get('/cluster/resources?type=vm');
    const vms = hostsResponse.data.data;
    
    // Check if hostname exists
    const normalizedHostname = hostname.toLowerCase();
    const exists = vms.some(vm => vm.name.toLowerCase() === normalizedHostname);
    
    if (exists) {
      return res.status(200).json({
        available: false,
        message: `Hostname '${hostname}' is already in use`
      });
    }
    
    // If prefix is provided, suggest additional names
    let suggestions = [];
    if (prefix) {
      const prefixLower = prefix.toLowerCase();
      
      // Get existing hostnames with this prefix
      const existingPrefixNames = vms
        .filter(vm => vm.name.toLowerCase().startsWith(prefixLower))
        .map(vm => vm.name);
      
      // Find highest number
      let maxNumber = 0;
      existingPrefixNames.forEach(name => {
        const match = name.match(new RegExp(`^${prefix}(\\d+)$`, 'i'));
        if (match && match[1]) {
          const num = parseInt(match[1]);
          if (num > maxNumber) {
            maxNumber = num;
          }
        }
      });
      
      // Generate suggestions
      for (let i = 1; i <= 3; i++) {
        suggestions.push(`${prefix}${maxNumber + i}`);
      }
    }
    
    return res.status(200).json({
      available: true,
      suggestions
    });
  } catch (error) {
    logger.error('Failed to check hostname', error);
    
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check hostname'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message
  });
});

// Setup Kafka consumer
async function setupConsumer() {
  await consumer.connect();
  
  await consumer.subscribe({ 
    topic: process.env.KAFKA_TOPIC_HOSTNAME_REQUEST || 'hostname-requests', 
    fromBeginning: false 
  });
  
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const request = JSON.parse(message.value.toString());
        logger.info(`Processing hostname request: ${request.hostname}`);
        
        // Get hosts
        const hostsResponse = await proxmoxApi.get('/cluster/resources?type=vm');
        const vms = hostsResponse.data.data;
        
        // Check if hostname exists
        const normalizedHostname = request.hostname.toLowerCase();
        const exists = vms.some(vm => vm.name.toLowerCase() === normalizedHostname);
        
        // Send response message
        await producer.send({
          topic: process.env.KAFKA_TOPIC_HOSTNAME_RESPONSE || 'hostname-responses',
          messages: [
            {
              key: message.key,
              value: JSON.stringify({
                requestId: request.requestId,
                hostname: request.hostname,
                available: !exists,
                timestamp: new Date().toISOString()
              })
            }
          ]
        });
        
        logger.info(`Processed hostname request for ${request.hostname}: available=${!exists}`);
      } catch (error) {
        logger.error('Error processing Kafka message', error);
      }
    }
  });
  
  logger.info('Kafka consumer setup complete');
}

// Start server
async function startServer() {
  try {
    await producer.connect();
    logger.info('Connected to Kafka producer');
    
    await setupConsumer();
    
    app.listen(port, () => {
      logger.info(`ProxMox service listening on port ${port}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await consumer.disconnect();
  await producer.disconnect();
  process.exit(0);
});

// Start the server
startServer();