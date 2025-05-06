require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Kafka } = require('kafkajs');
const winston = require('winston');
const ldap = require('ldapjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
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
  clientId: process.env.KAFKA_CLIENT_ID || 'auth-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:29092']
});

const producer = kafka.producer();

// Initialize Express app
const app = express();
const port = process.env.PORT || 8001;

// Apply middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(cookieParser());

// Apply rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Create LDAP client
const createLdapClient = () => {
  return ldap.createClient({
    url: process.env.LDAP_URL || 'ldap://ldap.example.com:389',
    reconnect: true,
    timeout: 5000,
    connectTimeout: 10000
  });
};

/**
 * @route POST /auth/login
 * @desc Authenticate user with LDAP
 * @access Public
 */
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  // Validate request
  if (!username || !password) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Username and password are required'
    });
  }
  
  const client = createLdapClient();
  
  client.on('error', (err) => {
    logger.error('LDAP connection error', err);
    client.destroy();
    
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to connect to authentication server'
      });
    }
  });
  
  try {
    // Bind with service account
    await new Promise((resolve, reject) => {
      client.bind(
        process.env.LDAP_BIND_DN || 'cn=admin,dc=example,dc=com',
        process.env.LDAP_BIND_PASSWORD || 'admin',
        (err) => {
          if (err) {
            logger.error('Service bind error', err);
            return reject(err);
          }
          resolve();
        }
      );
    });
    
    // Search for user
    const searchFilter = (process.env.LDAP_SEARCH_FILTER || '(uid={{username}})')
      .replace('{{username}}', ldap.filter.escape(username));
    
    const searchOptions = {
      scope: 'sub',
      filter: searchFilter,
      attributes: ['dn', 'cn', 'sn', 'mail', 'uid']
    };
    
    const searchPromise = new Promise((resolve, reject) => {
      client.search(
        process.env.LDAP_SEARCH_BASE || 'ou=users,dc=example,dc=com',
        searchOptions,
        (err, searchRes) => {
          if (err) {
            logger.error('User search error', err);
            return reject(err);
          }
          
          let user = null;
          
          searchRes.on('searchEntry', (entry) => {
            user = {
              dn: entry.objectName,
              ...entry.attributes.reduce((acc, attr) => {
                acc[attr.type] = attr.vals[0];
                return acc;
              }, {})
            };
          });
          
          searchRes.on('error', (err) => {
            logger.error('User search result error', err);
            reject(err);
          });
          
          searchRes.on('end', () => {
            if (!user) {
              return reject(new Error('User not found'));
            }
            resolve(user);
          });
        }
      );
    });
    
    const user = await searchPromise;
    
    // Bind with user credentials to verify password
    await new Promise((resolve, reject) => {
      const userClient = createLdapClient();
      
      userClient.bind(user.dn, password, (err) => {
        userClient.destroy();
        
        if (err) {
          logger.error('User bind error', err);
          return reject(new Error('Invalid credentials'));
        }
        
        resolve();
      });
    });
    
    // Generate JWT token
    const token = jwt.sign(
      {
        uid: user.uid,
        name: user.cn,
        email: user.mail
      },
      process.env.JWT_SECRET || 'your_jwt_secret_here',
      {
        expiresIn: process.env.JWT_EXPIRATION || '1h',
        issuer: process.env.JWT_ISSUER || 'server-name-picker'
      }
    );
    
    // Log user activity to Kafka
    try {
      await producer.send({
        topic: process.env.KAFKA_TOPIC_USER_ACTIVITY || 'user-activity',
        messages: [
          {
            key: user.uid,
            value: JSON.stringify({
              action: 'login',
              userId: user.uid,
              timestamp: new Date().toISOString()
            })
          }
        ]
      });
    } catch (kafkaError) {
      logger.error('Failed to log to Kafka', kafkaError);
    }
    
    // Return token and user info
    return res.status(200).json({
      token,
      user: {
        uid: user.uid,
        name: user.cn,
        email: user.mail
      }
    });
  } catch (error) {
    logger.error('Authentication error', error);
    
    if (error.message === 'User not found' || error.message === 'Invalid credentials') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid username or password'
      });
    }
    
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed'
    });
  } finally {
    client.destroy();
  }
});

/**
 * @route GET /auth/user
 * @desc Get current user info
 * @access Private
 */
app.get('/auth/user', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication token is required'
    });
  }
  
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your_jwt_secret_here'
    );
    
    return res.status(200).json({
      user: {
        uid: decoded.uid,
        name: decoded.name,
        email: decoded.email
      }
    });
  } catch (error) {
    logger.error('Token verification error', error);
    
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    });
  }
});

/**
 * @route POST /auth/logout
 * @desc Logout user
 * @access Private
 */
app.post('/auth/logout', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication token is required'
    });
  }
  
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your_jwt_secret_here'
    );
    
    // Log user logout to Kafka
    producer.send({
      topic: process.env.KAFKA_TOPIC_USER_ACTIVITY || 'user-activity',
      messages: [
        {
          key: decoded.uid,
          value: JSON.stringify({
            action: 'logout',
            userId: decoded.uid,
            timestamp: new Date().toISOString()
          })
        }
      ]
    }).catch(error => {
      logger.error('Failed to log to Kafka', error);
    });
    
    return res.status(200).json({
      message: 'Successfully logged out'
    });
  } catch (error) {
    logger.error('Logout error', error);
    
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token'
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

// Start server
async function startServer() {
  try {
    await producer.connect();
    logger.info('Connected to Kafka');
    
    app.listen(port, () => {
      logger.info(`Auth service listening on port ${port}`);
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