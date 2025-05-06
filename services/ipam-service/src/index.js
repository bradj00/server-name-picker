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
  clientId: process.env.KAFKA_CLIENT_ID || 'ipam-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:29092']
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: process.env.KAFKA_GROUP_ID || 'ipam-service-group' });

// Initialize cache
const cache = new NodeCache({
  stdTTL: parseInt(process.env.CACHE_TTL) || 300,
  checkperiod: 120
});

// Initialize Express app
const app = express();
const port = process.env.PORT || 8003;

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

// Create the phpIPAM API client
const phpIpamApi = axios.create({
  baseURL: process.env.PHPIPAM_API_URL || 'https://ipam.example.com/api',
  validateStatus: (status) => status >= 200 && status < 300
});

// Function to authenticate with phpIPAM API
const authenticateIpam = async () => {
  try {
    const tokenKey = 'phpipam_token';
    let token = cache.get(tokenKey);
    
    if (token) {
      phpIpamApi.defaults.headers.common['token'] = token;
      return token;
    }
    
    // Use API key if available
    if (process.env.PHPIPAM_API_TOKEN) {
      phpIpamApi.defaults.headers.common['token'] = process.env.PHPIPAM_API_TOKEN;
      cache.set(tokenKey, process.env.PHPIPAM_API_TOKEN);
      return process.env.PHPIPAM_API_TOKEN;
    }
    
    // Otherwise, use username/password
    const appId = process.env.PHPIPAM_API_APP_ID || 'server-name-picker';
    const response = await axios.post(
      `${process.env.PHPIPAM_API_URL || 'https://ipam.example.com/api'}/${appId}/user/`,
      {
        username: process.env.PHPIPAM_API_USERNAME || 'admin',
        password: process.env.PHPIPAM_API_PASSWORD || 'password'
      }
    );
    
    token = response.data.data.token;
    phpIpamApi.defaults.headers.common['token'] = token;
    
    // Cache the token (typically valid for 6 hours)
    cache.set(tokenKey, token, 21000); // 5h50m
    
    return token;
  } catch (error) {
    logger.error('Failed to authenticate with phpIPAM API', error);
    throw error;
  }
};

/**
 * @route GET /ipam/subnets
 * @desc Get all available subnets
 * @access Private
 */
app.get('/ipam/subnets', verifyToken, async (req, res) => {
  try {
    // Check cache first
    const cacheKey = 'ipam_subnets';
    const cachedSubnets = cache.get(cacheKey);
    
    if (cachedSubnets) {
      logger.debug('Returning cached subnets');
      return res.status(200).json(cachedSubnets);
    }
    
    // Authenticate with phpIPAM API
    await authenticateIpam();
    
    // Call phpIPAM API to get subnets
    const appId = process.env.PHPIPAM_API_APP_ID || 'server-name-picker';
    const response = await phpIpamApi.get(`/${appId}/subnets/`);
    const subnets = response.data.data;
    
    // Cache the result
    cache.set(cacheKey, subnets);
    
    return res.status(200).json(subnets);
  } catch (error) {
    logger.error('Failed to get subnets', error);
    
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get subnets from IPAM'
    });
  }
});

/**
 * @route GET /ipam/subnet/:id
 * @desc Get information about a specific subnet
 * @access Private
 */
app.get('/ipam/subnet/:id', verifyToken, async (req, res) => {
  try {
    const subnetId = req.params.id;
    
    // Check cache first
    const cacheKey = `ipam_subnet_${subnetId}`;
    const cachedSubnet = cache.get(cacheKey);
    
    if (cachedSubnet) {
      logger.debug(`Returning cached subnet ${subnetId}`);
      return res.status(200).json(cachedSubnet);
    }
    
    // Authenticate with phpIPAM API
    await authenticateIpam();
    
    // Call phpIPAM API to get subnet details
    const appId = process.env.PHPIPAM_API_APP_ID || 'server-name-picker';
    const response = await phpIpamApi.get(`/${appId}/subnets/${subnetId}/`);
    const subnet = response.data.data;
    
    // Get addresses in this subnet
    const addressesResponse = await phpIpamApi.get(`/${appId}/subnets/${subnetId}/addresses/`);
    const addresses = addressesResponse.data.data || [];
    
    const result = {
      ...subnet,
      addresses
    };
    
    // Cache the result
    cache.set(cacheKey, result);
    
    return res.status(200).json(result);
  } catch (error) {
    logger.error(`Failed to get subnet ${req.params.id}`, error);
    
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get subnet information from IPAM'
    });
  }
});

/**
 * @route GET /ipam/addresses
 * @desc Get all IP addresses in use
 * @access Private
 */
app.get('/ipam/addresses', verifyToken, async (req, res) => {
  try {
    // Check cache first
    const cacheKey = 'ipam_addresses';
    const cachedAddresses = cache.get(cacheKey);
    
    if (cachedAddresses) {
      logger.debug('Returning cached addresses');
      return res.status(200).json(cachedAddresses);
    }
    
    // Authenticate with phpIPAM API
    await authenticateIpam();
    
    // Call phpIPAM API to get addresses
    const appId = process.env.PHPIPAM_API_APP_ID || 'server-name-picker';
    const response = await phpIpamApi.get(`/${appId}/addresses/`);
    const addresses = response.data.data;
    
    // Cache the result
    cache.set(cacheKey, addresses);
    
    return res.status(200).json(addresses);
  } catch (error) {
    logger.error('Failed to get addresses', error);
    
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get addresses from IPAM'
    });
  }
});

/**
 * @route POST /ipam/check-ip
 * @desc Check if IP address is available
 * @access Private
 */
app.post('/ipam/check-ip', verifyToken, async (req, res) => {
  try {
    const { ip, subnetId } = req.body;
    
    if (!subnetId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Subnet ID is required'
      });
    }
    
    // Authenticate with phpIPAM API
    await authenticateIpam();
    
    // If specific IP is provided, check if it's available
    if (ip) {
      const appId = process.env.PHPIPAM_API_APP_ID || 'server-name-picker';
      const response = await phpIpamApi.get(`/${appId}/addresses/search/${ip}/`);
      const found = response.data.data && response.data.data.length > 0;
      
      if (found) {
        return res.status(200).json({
          available: false,
          message: `IP address ${ip} is already in use`
        });
      } else {
        return res.status(200).json({
          available: true
        });
      }
    } else {
      // If no IP provided, return error
      return res.status(400).json({
        error: 'Bad Request',
        message: 'IP address is required'
      });
    }
  } catch (error) {
    logger.error('Failed to check IP address', error);
    
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check IP address availability'
    });
  }
});

/**
 * @route POST /ipam/next-available
 * @desc Get next available IP in a subnet
 * @access Private
 */
app.post('/ipam/next-available', verifyToken, async (req, res) => {
  try {
    const { subnetId } = req.body;
    
    if (!subnetId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Subnet ID is required'
      });
    }
    
    // Authenticate with phpIPAM API
    await authenticateIpam();
    
    // Call phpIPAM API to get first available address in subnet
    const appId = process.env.PHPIPAM_API_APP_ID || 'server-name-picker';
    const response = await phpIpamApi.get(`/${appId}/subnets/${subnetId}/first_free/`);
    const ip = response.data.data;
    
    return res.status(200).json({
      ip,
      subnetId
    });
  } catch (error) {
    logger.error('Failed to get next available IP', error);
    
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get next available IP address'
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
    topic: process.env.KAFKA_TOPIC_IP_REQUEST || 'ip-requests', 
    fromBeginning: false 
  });
  
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const request = JSON.parse(message.value.toString());
        logger.info(`Processing IP request for subnet: ${request.subnetId}`);
        
        // Authenticate with phpIPAM API
        await authenticateIpam();
        
        // Get next available IP
        const appId = process.env.PHPIPAM_API_APP_ID || 'server-name-picker';
        const response = await phpIpamApi.get(
          `/${appId}/subnets/${request.subnetId}/first_free/`
        );
        const ip = response.data.data;
        
        // Send response message
        await producer.send({
          topic: process.env.KAFKA_TOPIC_IP_RESPONSE || 'ip-responses',
          messages: [
            {
              key: message.key,
              value: JSON.stringify({
                requestId: request.requestId,
                subnetId: request.subnetId,
                ip,
                timestamp: new Date().toISOString()
              })
            }
          ]
        });
        
        logger.info(`Processed IP request for subnet ${request.subnetId}: ip=${ip}`);
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
      logger.info(`IPAM service listening on port ${port}`);
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