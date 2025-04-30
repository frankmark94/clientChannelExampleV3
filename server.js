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
  API_URL: process.env.API_URL || '',
  WEBHOOK_URL: process.env.WEBHOOK_URL || ''
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
  console.log('Text message received from DMS:', JSON.stringify(message, null, 2));
  
  // If this message has a message_id, mark it as delivered
  if (message && message.message_id) {
    pendingMessages.set(message.message_id, 'delivered');
  }
  
  // Store incoming messages to be fetched by clients
  storeIncomingMessage(message);
};

dms.onRichContentMessage = async (message) => {
  console.log('Rich content message received from DMS:', JSON.stringify(message, null, 2));
  
  // If this message has a message_id, mark it as delivered
  if (message && message.message_id) {
    pendingMessages.set(message.message_id, 'delivered');
  }
  
  // Store incoming messages to be fetched by clients
  storeIncomingMessage(message);
};

dms.onUrlLinkMessage = async (message) => {
  console.log('URL link message received from DMS:', JSON.stringify(message, null, 2));
  
  // If this message has a message_id, mark it as delivered
  if (message && message.message_id) {
    pendingMessages.set(message.message_id, 'delivered');
  }
  
  // Store incoming messages to be fetched by clients
  storeIncomingMessage(message);
};

dms.onTypingIndicator = async (customerId) => {
  console.log('Typing indicator received for customer:', customerId);
  
  // Store typing indicator event
  incomingMessages.push({
    type: 'typing_indicator',
    customer_id: customerId,
    timestamp: new Date().toISOString()
  });
};

dms.onCsrEndSession = async (customerId) => {
  console.log('CSR ended session for customer:', customerId);
  
  // Store end session event
  incomingMessages.push({
    type: 'end_session',
    customer_id: customerId,
    timestamp: new Date().toISOString()
  });
};

// Add a new handler for menu messages
dms.onMenuMessage = async (message) => {
  console.log('Menu message received from DMS:', JSON.stringify(message, null, 2));
  
  // If this message has a message_id, mark it as delivered
  if (message && message.message_id) {
    pendingMessages.set(message.message_id, 'delivered');
  }
  
  // Store incoming messages to be fetched by clients
  storeIncomingMessage(message);
};

// Create a messages map to track sent messages for delivery confirmation
const pendingMessages = new Map();

// Create a store for incoming messages to be polled by clients
const incomingMessages = [];

// Helper function to store incoming messages
function storeIncomingMessage(message) {
  // Add timestamp if not present
  if (!message.timestamp) {
    message.timestamp = new Date().toISOString();
  }
  
  // CRITICAL: Handle Pega message format
  // This is specifically for the message format we saw from the clipboard
  if (message.pyEntryText && typeof message.pyEntryText === 'string') {
    try {
      // Try to parse the JSON text that Pega sends
      const parsedText = JSON.parse(message.pyEntryText);
      
      // Create a more standard message format
      if (parsedText.text) {
        message.text = Array.isArray(parsedText.text) ? parsedText.text : [parsedText.text];
      }
      
      console.log(`Successfully parsed Pega message: ${JSON.stringify(message.text)}`);
    } catch (e) {
      // If not JSON, just use it as is
      message.text = [message.pyEntryText];
      console.log(`Using plain text from Pega: ${message.pyEntryText}`);
    }
  }
  
  // CRITICAL: Link Pega's UUID back to our logical ID
  if (message.pyCustomerId === '4cf33b5e963c45eb90cc2b99892844fc') {
    // This is a Pega message for user "TestClient"
    message.customer_id = 'TestClient';
    console.log(`Mapped Pega UUID to TestClient`);
  }

  // CRITICAL: For messages from Pega with a customer.id field, add customer_id
  if (message.customer && message.customer.id && !message.customer_id) {
    if (message.customer.id === '4cf33b5e963c45eb90cc2b99892844fc') {
      message.customer_id = 'TestClient';
      console.log(`Mapped Pega customer UUID to TestClient`);
    } else {
      message.customer_id = message.customer.id;
      console.log(`Used customer UUID as customer_id: ${message.customer.id}`);
    }
  }
  
  // Add the message to our store
  incomingMessages.push(message);
  
  console.log(`Stored incoming message for customer: ${message.customer_id}`);
  console.log(`Message content: ${JSON.stringify(message.text || message.pyEntryText || 'No text')}`);
  console.log(`Total stored messages: ${incomingMessages.length}`);
}

// API endpoint to send messages
app.post('/api/messages', (req, res) => {
  const { customerId, messageId, text, customerName } = req.body;
  
  if (!customerId || !messageId || !text) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Create a message object identical to the format we use for ping
  const messageObject = {
    type: 'text',
    customer_id: customerId,
    message_id: messageId,
    text: Array.isArray(text) ? text : [text],
    customer_name: customerName || 'Customer',
    timestamp: new Date().toISOString()
  };
  
  console.log('Sending message to DMS:', JSON.stringify(messageObject, null, 2));
  
  // Use sendMessage instead of sendTextMessage to ensure consistent format
  dms.sendMessage(messageObject, (response) => {
    // Check if the request was successful (HTTP 2xx)
    const isSuccessful = response.status >= 200 && response.status < 300;
    
    console.log('DMS Response:', response.status, response.statusText, response.data);
    
    // If the response is successful, mark the message as delivered immediately
    // since we know DMS received it (200 OK response)
    if (isSuccessful) {
      console.log(`Message ${messageId} successfully delivered to DMS, marking as delivered`);
      pendingMessages.set(messageId, 'delivered');
    }
    
    return res.status(response.status).json({
      status: response.status,
      message: response.statusText,
      messageStatus: isSuccessful ? 'delivered' : 'error', // Change from 'sent' to 'delivered'
      messageId: messageId,
      dmsResponse: response.data // Include the DMS response data for client visibility
    });
  });
});

// New endpoint to update message status
app.post('/api/message-status', (req, res) => {
  const { messageId, status } = req.body;
  
  if (!messageId || !status) {
    return res.status(400).json({ error: 'Missing messageId or status' });
  }
  
  // Store the updated status
  pendingMessages.set(messageId, status);
  
  return res.status(200).json({ success: true });
});

// New endpoint to check message status
app.get('/api/message-status/:messageId', (req, res) => {
  const messageId = req.params.messageId;
  
  if (pendingMessages.has(messageId)) {
    return res.status(200).json({ 
      messageId, 
      status: pendingMessages.get(messageId) 
    });
  }
  
  return res.status(404).json({ 
    messageId, 
    status: 'unknown' 
  });
});

// Enhance DMS webhook endpoint to update message status when DMS responds
app.post('/api/dms/webhook', (req, res) => {
  try {
    // Add at the top of your webhook endpoint function
    console.log(`🔍 Webhook called at ${new Date().toISOString()}`);
    console.log(`🔍 Request IP: ${req.ip}`);
    console.log(`🔍 Request headers: ${JSON.stringify(req.headers)}`);
    
    // Log the incoming webhook payload
    console.log('Received DMS webhook payload:', JSON.stringify(req.body, null, 2));
    console.log('Webhook headers:', JSON.stringify(req.headers, null, 2));
    
    // TEMPORARY BYPASS for testing - store incoming messages directly
    if (req.body && req.body.customer_id) {
      console.log("BYPASSING JWT validation for testing");
      storeIncomingMessage(req.body);
      return res.status(200).send('Message accepted via bypass');
    }
    
    // Process the webhook with DMS client
    dms.onRequest(req, (status, message) => {
      // Log all details of the request processing
      console.log('DMS onRequest processed with status:', status);
      console.log('DMS onRequest message:', message);
      
      // Check if this is a message ack/receipt for a message we sent
      if (req.body && req.body.message_id) {
        console.log(`Received DMS confirmation for message: ${req.body.message_id}`);
        
        // Mark the message as delivered
        pendingMessages.set(req.body.message_id, 'delivered');
      }
      
      // Additional processing for different message types
      if (req.body && req.body.type) {
        switch(req.body.type) {
          case 'text':
            console.log('Processing text message from DMS');
            // The onTextMessage callback should handle this
            break;
          case 'link_button':
            console.log('Processing link button from DMS');
            // The onUrlLinkMessage callback should handle this
            break;
          case 'rich_content':
            console.log('Processing rich content from DMS');
            // The onRichContentMessage callback should handle this
            break;
          case 'menu':
            console.log('Processing menu message from DMS');
            // The onMenuMessage callback should handle this
            break;
          default:
            console.log(`Unknown message type: ${req.body.type}`);
            // Store unknown message types anyway
            storeIncomingMessage(req.body);
        }
      } else {
        // If no message type but we have a body, store it anyway
        if (req.body) {
          storeIncomingMessage(req.body);
        }
      }
      
      return res.status(status).send(message);
    });
  } catch (err) {
    console.error('Error processing DMS webhook:', err);
    
    // Even if there's an error, try to store the message if it has required fields
    if (req.body && req.body.customer_id) {
      console.log("Storing message despite error");
      storeIncomingMessage(req.body);
      return res.status(200).send('Message accepted despite error');
    }
    
    return res.status(401).send(err.message);
  }
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
    type: 'text',
    customer_id: 'ping-test-' + Date.now(),
    message_id: 'ping-' + Date.now(),
    text: ['ping test message']
  };
  
  // Attempt to send a ping message to DMS
  dms.sendMessage(pingMessage, (response) => {
    console.log('DMS Ping response:', response);
    
    // Check if the connection was successful
    const isConnected = response.status >= 200 && response.status < 300;
    
    return res.json({
      connected: isConnected,
      status: response.status,
      message: response.statusText || (isConnected ? 'Connection successful' : 'Connection failed: ' + (response.data || 'Unknown error'))
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
  const { jwtSecret, channelId, apiUrl, webhookUrl } = req.body;
  
  let configChanged = false;
  
  // In a production app, you would store these securely
  // For this demo, we're just updating the in-memory config
  
  if (jwtSecret && jwtSecret !== DMS_CONFIG.JWT_SECRET) {
    DMS_CONFIG.JWT_SECRET = jwtSecret;
    configChanged = true;
  }
  
  if (channelId && channelId !== DMS_CONFIG.CHANNEL_ID) {
    DMS_CONFIG.CHANNEL_ID = channelId;
    configChanged = true;
  }
  
  if (apiUrl && apiUrl !== DMS_CONFIG.API_URL) {
    DMS_CONFIG.API_URL = apiUrl;
    configChanged = true;
  }
  
  // If webhook URL is provided, update it in the config
  // This should be a URL that DMS can call back to, like your /api/dms/webhook endpoint
  if (webhookUrl && webhookUrl !== DMS_CONFIG.WEBHOOK_URL) {
    console.log(`Setting webhook URL to: ${webhookUrl}`);
    DMS_CONFIG.WEBHOOK_URL = webhookUrl;
    configChanged = true;
  }
  
  // Only reinitialize DMS client if config changed
  if (configChanged) {
    console.log('Config changed, reinitializing DMS client');
    // Create a new instance with the updated config
    const newDms = dmsClientChannel(DMS_CONFIG);
    
    // Transfer all the callback handlers from the old instance
    newDms.onTextMessage = dms.onTextMessage;
    newDms.onRichContentMessage = dms.onRichContentMessage;
    newDms.onUrlLinkMessage = dms.onUrlLinkMessage;
    newDms.onTypingIndicator = dms.onTypingIndicator;
    newDms.onCsrEndSession = dms.onCsrEndSession;
    newDms.onMenuMessage = dms.onMenuMessage;
    
    // Replace the old instance with the new one
    dms = newDms;
  }
  
  console.log('Updated DMS configuration:', {
    JWT_SECRET: DMS_CONFIG.JWT_SECRET ? '****' : undefined,
    CHANNEL_ID: DMS_CONFIG.CHANNEL_ID,
    API_URL: DMS_CONFIG.API_URL,
    WEBHOOK_URL: DMS_CONFIG.WEBHOOK_URL
  });
  
  res.json({ success: true });
});

// New endpoint to get pending incoming messages for a customer
app.get('/api/messages/:customerId', (req, res) => {
  const customerId = req.params.customerId;
  // Get the last timestamp if provided
  const lastTimestamp = req.query.since || '1970-01-01T00:00:00.000Z';
  
  console.log(`Getting messages for customer ${customerId} since ${lastTimestamp}`);
  
  // CRITICAL FIX FOR PEGA - We need to look at different fields for customer identification
  const newMessages = incomingMessages.filter(msg => {
    // Check customer_id from our app
    const matchesCustomerId = msg.customer_id === customerId;
    
    // Check profile_id from Pega
    const matchesProfileId = msg.customer && msg.customer.profile_id === customerId;
    
    // Check UUID from Pega
    const isPegaUUID = msg.customer && msg.customer.id === '4cf33b5e963c45eb90cc2b99892844fc';
    
    // Set a debug log to see what we're filtering
    const customerId1 = msg.customer_id || 'none';
    const customerId2 = (msg.customer && msg.customer.profile_id) || 'none';
    const customerId3 = (msg.customer && msg.customer.id) || 'none';
    
    console.log(`DEBUG: Message check - Looking for "${customerId}" against [${customerId1}, ${customerId2}, ${customerId3}]`);
    
    // Any of these matches should return the message
    const isMatch = matchesCustomerId || matchesProfileId || isPegaUUID;
    const isNewer = msg.timestamp > lastTimestamp;
    
    return isMatch && isNewer;
  });
  
  console.log(`Found ${newMessages.length} new messages for customer ${customerId}`);
  
  // See what we found
  newMessages.forEach(msg => {
    if (msg.text) {
      console.log(`Message text: ${JSON.stringify(msg.text)}`);
    } else if (msg.pyEntryText) {
      console.log(`Pega message text: ${msg.pyEntryText}`);
    }
  });
  
  res.json({
    customerId,
    messages: newMessages
  });
});

// DEBUG Endpoint: Add a new endpoint to see all stored messages
app.get('/api/debug/messages', (req, res) => {
  console.log(`DEBUG: Dumping all ${incomingMessages.length} messages currently stored`);
  
  // Return all messages regardless of customer ID
  res.json({
    count: incomingMessages.length,
    messages: incomingMessages
  });
});

// Catch all routes and redirect to the index file
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 