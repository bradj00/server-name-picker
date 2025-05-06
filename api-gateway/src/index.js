require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Kafka } = require('kafkajs');
const winston = require('winston');
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
  clientId: process.env.KAFKA_CLIENT_ID || 'api-gateway',
  brokers: [process.env.KAFKA_BROKER || 'localhost:29092']
});

const producer = kafka.producer();

// Initialize Express app
const app = express();
const port = process.env.PORT || 8000;

// Apply middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*'
}));
app.use(morgan('combined'));
app.use(express.json());

// Apply rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes by default
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/proxmox', require('./routes/proxmox'));
app.use('/api/ipam', require('./routes/ipam'));

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message
  });
});

// Start server
async function startServer() {
  try {
    await producer.connect();
    logger.info('Connected to Kafka');
    
    app.listen(port, () => {
      logger.info(`API Gateway listening on port ${port}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await producer.disconnect();
  process.exit(0);
});

// Start the server
startServer();