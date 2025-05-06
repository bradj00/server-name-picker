const express = require('express');
const axios = require('axios');
const router = express.Router();
const { Kafka } = require('kafkajs');

// IPAM service URL
const ipamServiceUrl = process.env.IPAM_SERVICE_URL || 'http://localhost:8003';

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
 * @route GET /api/ipam/subnets
 * @desc Get all available subnets
 * @access Private
 */
router.get('/subnets', isAuthenticated, async (req, res, next) => {
  try {
    // Forward request to IPAM service
    const token = req.headers.authorization?.split(' ')[1];
    
    const response = await axios.get(`${ipamServiceUrl}/ipam/subnets`, {
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
 * @route GET /api/ipam/subnet/:id
 * @desc Get information about a specific subnet
 * @access Private
 */
router.get('/subnet/:id', isAuthenticated, async (req, res, next) => {
  try {
    // Forward request to IPAM service
    const token = req.headers.authorization?.split(' ')[1];
    
    const response = await axios.get(`${ipamServiceUrl}/ipam/subnet/${req.params.id}`, {
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
 * @route GET /api/ipam/addresses
 * @desc Get all IP addresses in use
 * @access Private
 */
router.get('/addresses', isAuthenticated, async (req, res, next) => {
  try {
    // Forward request to IPAM service
    const token = req.headers.authorization?.split(' ')[1];
    
    const response = await axios.get(`${ipamServiceUrl}/ipam/addresses`, {
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
 * @route POST /api/ipam/check-ip
 * @desc Check if IP address is available
 * @access Private
 */
router.post('/check-ip', isAuthenticated, async (req, res, next) => {
  try {
    const { ip, subnetId } = req.body;
    
    // Validate request
    if (!subnetId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Subnet ID is required'
      });
    }
    
    // Forward request to IPAM service
    const token = req.headers.authorization?.split(' ')[1];
    
    const response = await axios.post(`${ipamServiceUrl}/ipam/check-ip`, {
      ip,
      subnetId
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

/**
 * @route POST /api/ipam/next-available
 * @desc Get next available IP in a subnet
 * @access Private
 */
router.post('/next-available', isAuthenticated, async (req, res, next) => {
  try {
    const { subnetId } = req.body;
    
    // Validate request
    if (!subnetId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Subnet ID is required'
      });
    }
    
    // Forward request to IPAM service
    const token = req.headers.authorization?.split(' ')[1];
    
    const response = await axios.post(`${ipamServiceUrl}/ipam/next-available`, {
      subnetId
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