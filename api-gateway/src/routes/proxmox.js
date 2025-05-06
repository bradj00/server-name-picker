const express = require('express');
const axios = require('axios');
const router = express.Router();
const { Kafka } = require('kafkajs');

// ProxMox service URL
const proxmoxServiceUrl = process.env.PROXMOX_SERVICE_URL || 'http://localhost:8002';

// Initialize Kafka
const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'api-gateway',
  brokers: [process.env.KAFKA_BROKER || 'localhost:29092']
});

const producer = kafka.producer();

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication token is required'
    });
  }
  
  // You would typically verify the token here
  // For simplicity, we're just checking if it exists
  
  next();
};

/**
 * @route GET /api/proxmox/nodes
 * @desc Get all ProxMox nodes
 * @access Private
 */
router.get('/nodes', isAuthenticated, async (req, res, next) => {
  try {
    // Forward request to proxmox service
    const token = req.headers.authorization?.split(' ')[1];
    
    const response = await axios.get(`${proxmoxServiceUrl}/proxmox/nodes`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    return res.status(200).json(response.data);
  } catch (error) {
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    next(error);
  }
});

/**
 * @route GET /api/proxmox/vms
 * @desc Get all VMs across all nodes
 * @access Private
 */
router.get('/vms', isAuthenticated, async (req, res, next) => {
  try {
    // Forward request to proxmox service
    const token = req.headers.authorization?.split(' ')[1];
    
    const response = await axios.get(`${proxmoxServiceUrl}/proxmox/vms`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    return res.status(200).json(response.data);
  } catch (error) {
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    next(error);
  }
});

/**
 * @route GET /api/proxmox/hosts
 * @desc Get all hostnames in use
 * @access Private
 */
router.get('/hosts', isAuthenticated, async (req, res, next) => {
  try {
    // Forward request to proxmox service
    const token = req.headers.authorization?.split(' ')[1];
    
    const response = await axios.get(`${proxmoxServiceUrl}/proxmox/hosts`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    return res.status(200).json(response.data);
  } catch (error) {
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    next(error);
  }
});

/**
 * @route POST /api/proxmox/check-hostname
 * @desc Check if hostname is available
 * @access Private
 */
router.post('/check-hostname', isAuthenticated, async (req, res, next) => {
  try {
    const { hostname, prefix } = req.body;
    
    // Validate request
    if (!hostname) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Hostname is required'
      });
    }
    
    // Forward request to proxmox service
    const token = req.headers.authorization?.split(' ')[1];
    
    const response = await axios.post(`${proxmoxServiceUrl}/proxmox/check-hostname`, {
      hostname,
      prefix
    }, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    return res.status(200).json(response.data);
  } catch (error) {
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    next(error);
  }
});

module.exports = router;