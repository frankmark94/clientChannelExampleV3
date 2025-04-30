const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const dmsClientChannel = require('dms-client-channel');

// Load environment variables
try {
  require('dotenv').config();
  console.log('Environment variables loaded from .env file');
} catch (error) {
  console.log('No .env file found, using process environment variables');
}

// Load environment variables or use defaults
const PORT = process.env.PORT || 3000;
const DMS_CONFIG = {
  JWT_SECRET: process.env.JWT_SECRET || '',
  CHANNEL_ID: process.env.CHANNEL_ID || '',
  API_URL: process.env.API_URL || ''
};

// Initialize the app
const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize DMS Client Channel
const dms = dmsClientChannel(DMS_CONFIG);

// Setup DMS callback handlers
dms.onTextMessage = async (message) => {
  console.log('Text message received:', message);
  // In a real application, you would forward this to your client
};

dms.onRichContentMessage = async (message) => {
  console.log('Rich content message received:', message);
  // Forward to client
};

dms.onUrlLinkMessage = async (message) => {
  console.log('URL link message received:', message);
  // Forward to client
};

dms.onTypingIndicator = async (customerId) => {
  console.log('Typing indicator received for customer:', customerId);
  // Forward to client
};

dms.onCsrEndSession = async (customerId) => {
  console.log('CSR ended session for customer:', customerId);
  // Forward to client
};

// DMS Webhook Endpoint
app.post('/api/dms/webhook', (req, res) => {
  try {
    dms.onRequest(req, (status, message) => {
      return res.status(status).send(message);
    });
  } catch (err) {
    console.error('Error processing DMS webhook:', err);
    return res.status(401).send(err.message);
  }
});

// API endpoint to send messages
app.post('/api/messages', (req, res) => {
  const { customerId, messageId, text, customerName } = req.body;
  
  if (!customerId || !messageId || !text) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  dms.sendTextMessage(
    customerId,
    messageId,
    text,
    customerName || 'Customer',
    (response) => {
      return res.status(response.status).json({
        status: response.status,
        message: response.statusText
      });
    }
  );
});

// NEW ENDPOINT: API endpoint to ping DMS and check real connection
app.get('/api/ping', (req, res) => {
  // Check if we have the necessary configuration values
  if (!DMS_CONFIG.JWT_SECRET || !DMS_CONFIG.CHANNEL_ID || !DMS_CONFIG.API_URL) {
    return res.json({ 
      connected: false, 
      message: 'Missing configuration values'
    });
  }
  
  // Create a test message to ping the DMS
  const pingMessage = {
    type: 'ping',
    customer_id: 'ping-test-' + Date.now(),
    message_id: 'ping-' + Date.now(),
    text: ['ping']
  };
  
  // Attempt to send a ping message to DMS
  dms.sendMessage(pingMessage, (response) => {
    console.log('DMS Ping response:', response);
    
    // Check if the connection was successful
    const isConnected = response.status >= 200 && response.status < 300;
    
    return res.json({
      connected: isConnected,
      status: response.status,
      message: response.statusText || 'Connection successful'
    });
  });
});

// API endpoint to get configuration
app.get('/api/config', (req, res) => {
  res.json({
    // Only send what the client needs to know
    connected: !!DMS_CONFIG.JWT_SECRET && !!DMS_CONFIG.CHANNEL_ID && !!DMS_CONFIG.API_URL
  });
});

// API endpoint to update configuration
app.post('/api/config', (req, res) => {
  const { jwtSecret, channelId, apiUrl } = req.body;
  
  // In a production app, you would store these securely
  // For this demo, we're just updating the in-memory config
  
  if (jwtSecret) DMS_CONFIG.JWT_SECRET = jwtSecret;
  if (channelId) DMS_CONFIG.CHANNEL_ID = channelId;
  if (apiUrl) DMS_CONFIG.API_URL = apiUrl;
  
  // Reinitialize DMS client with new config
  Object.assign(dms, dmsClientChannel(DMS_CONFIG));
  
  res.json({ success: true });
});

// Catch all routes and redirect to the index file
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 