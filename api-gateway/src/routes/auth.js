const express = require('express');
const axios = require('axios');
const router = express.Router();

// Authentication service URL
const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:8001';

/**
 * @route POST /api/auth/login
 * @desc Login user with LDAP
 * @access Public
 */
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    
    // Validate request
    if (!username || !password) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Username and password are required'
      });
    }
    
    // Forward authentication request to auth service
    const response = await axios.post(`${authServiceUrl}/auth/login`, {
      username,
      password
    });
    
    // Return the token and user data
    return res.status(200).json(response.data);
  } catch (error) {
    if (error.response) {
      // Forward error from auth service
      return res.status(error.response.status).json(error.response.data);
    }
    next(error);
  }
});

/**
 * @route POST /api/auth/logout
 * @desc Logout user
 * @access Private
 */
router.post('/logout', async (req, res, next) => {
  try {
    // Get token from request
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication token is required'
      });
    }
    
    // Forward logout request to auth service
    await axios.post(`${authServiceUrl}/auth/logout`, {}, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    return res.status(200).json({
      message: 'Successfully logged out'
    });
  } catch (error) {
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    next(error);
  }
});

/**
 * @route GET /api/auth/user
 * @desc Get user info
 * @access Private
 */
router.get('/user', async (req, res, next) => {
  try {
    // Get token from request
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication token is required'
      });
    }
    
    // Forward request to auth service
    const response = await axios.get(`${authServiceUrl}/auth/user`, {
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