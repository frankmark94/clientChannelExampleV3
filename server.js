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
};

dms.onRichContentMessage = async (message) => {
  console.log('Rich content message received from DMS:', JSON.stringify(message, null, 2));
  
  // If this message has a message_id, mark it as delivered
  if (message && message.message_id) {
    pendingMessages.set(message.message_id, 'delivered');
  }
};

dms.onUrlLinkMessage = async (message) => {
  console.log('URL link message received from DMS:', JSON.stringify(message, null, 2));
  
  // If this message has a message_id, mark it as delivered
  if (message && message.message_id) {
    pendingMessages.set(message.message_id, 'delivered');
  }
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
};

// Create a messages map to track sent messages for delivery confirmation
const pendingMessages = new Map();

// Create a store for incoming messages to be polled by clients
const incomingMessages = [];

// ADD: Message deduplication tracking
const processedMessageIds = new Set();
const messageIdToStoredIndex = new Map(); // Track where messages are stored for updates

// Helper function to store incoming messages
function storeIncomingMessage(message) {
  // CRITICAL FIX: Check for duplicate message IDs first
  if (message.message_id && processedMessageIds.has(message.message_id)) {
    console.log(`🚫 Duplicate message detected: ${message.message_id}. Skipping storage.`);
    return false; // Indicate message was not stored
  }

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
  const messageIndex = incomingMessages.length;
  incomingMessages.push(message);
  
  // Track this message ID as processed
  if (message.message_id) {
    processedMessageIds.add(message.message_id);
    messageIdToStoredIndex.set(message.message_id, messageIndex);
  }
  
  console.log(`✅ Stored NEW message for customer: ${message.customer_id}`);
  console.log(`Message content: ${JSON.stringify(message.text || message.pyEntryText || 'No text')}`);
  console.log(`Total stored messages: ${incomingMessages.length}`);
  
  return true; // Indicate message was stored successfully
}

// API endpoint to send messages
app.post('/api/messages', (req, res) => {
  const { customerId, messageId, text, customerName, advancedPayload } = req.body;
  
  if (!customerId || !messageId) {
    return res.status(400).json({ error: 'Missing required fields: customerId and messageId' });
  }
  
  // Check if we have valid DMS configuration
  const hasValidConfig = !!(DMS_CONFIG.JWT_SECRET && DMS_CONFIG.JWT_SECRET.trim() && 
                           DMS_CONFIG.CHANNEL_ID && DMS_CONFIG.CHANNEL_ID.trim() && 
                           DMS_CONFIG.API_URL && DMS_CONFIG.API_URL.trim());
  
  if (!hasValidConfig) {
    const missingFields = [];
    if (!DMS_CONFIG.JWT_SECRET || !DMS_CONFIG.JWT_SECRET.trim()) missingFields.push('JWT_SECRET');
    if (!DMS_CONFIG.CHANNEL_ID || !DMS_CONFIG.CHANNEL_ID.trim()) missingFields.push('CHANNEL_ID');
    if (!DMS_CONFIG.API_URL || !DMS_CONFIG.API_URL.trim()) missingFields.push('API_URL');
    
    console.error('Cannot send message - missing DMS configuration:', missingFields);
    return res.status(500).json({ 
      error: 'DMS not configured', 
      message: `Missing configuration: ${missingFields.join(', ')}`,
      status: 500,
      messageStatus: 'error'
    });
  }
  
  let messageObject;
  
  // Check if this is an advanced payload request
  if (advancedPayload) {
    console.log('Processing advanced payload:', JSON.stringify(advancedPayload, null, 2));
    
    // Use the advanced payload directly (it's already in the correct Pega format)
    messageObject = advancedPayload;
    
    // Ensure required fields are present
    if (!messageObject.customer_id) messageObject.customer_id = customerId;
    if (!messageObject.message_id && messageObject.type !== 'typing_indicator' && messageObject.type !== 'customer_end_session') {
      messageObject.message_id = messageId;
    }
    if (!messageObject.timestamp) messageObject.timestamp = new Date().toISOString();
    
  } else {
    // Standard text message (backward compatibility)
    if (!text) {
      return res.status(400).json({ error: 'Missing required field: text' });
    }
    
    messageObject = {
      type: 'text',
      customer_id: customerId,
      message_id: messageId,
      text: Array.isArray(text) ? text : [text],
      customer_name: customerName || 'Customer',
      timestamp: new Date().toISOString()
    };
  }
  
  console.log('Sending message to DMS with config:', {
    API_URL: DMS_CONFIG.API_URL,
    CHANNEL_ID: DMS_CONFIG.CHANNEL_ID,
    messageObject: messageObject
  });
  
  // Use sendMessage to send the payload to DMS
  try {
    dms.sendMessage(messageObject, (response) => {
      console.log('DMS Response received:', {
        status: response ? response.status : 'NO_STATUS',
        statusText: response ? response.statusText : 'NO_STATUS_TEXT',
        data: response ? response.data : 'NO_DATA',
        fullResponse: response
      });
      
      // Check if the request was successful (HTTP 2xx)
      const isSuccessful = response && response.status >= 200 && response.status < 300;
      
      // If the response is successful, mark the message as delivered immediately
      // since we know DMS received it (200 OK response)
      if (isSuccessful && messageObject.message_id) {
        console.log(`✅ Message ${messageObject.message_id} successfully delivered to DMS, marking as delivered`);
        pendingMessages.set(messageObject.message_id, 'delivered');
      } else {
        console.error(`❌ Message ${messageObject.message_id} failed to send to DMS:`, response);
      }
      
      return res.status(response ? response.status : 500).json({
        status: response ? response.status : 500,
        message: response ? response.statusText : 'No response from DMS',
        messageStatus: isSuccessful ? 'delivered' : 'error',
        messageId: messageObject.message_id || messageId,
        messageType: messageObject.type,
        dmsResponse: response // Include the DMS response data for client visibility
      });
    });
  } catch (error) {
    console.error('❌ Error sending message to DMS:', error);
    return res.status(500).json({
      status: 500,
      message: 'Error sending message: ' + error.message,
      messageStatus: 'error',
      messageId: messageObject.message_id || messageId,
      messageType: messageObject.type,
      error_details: error.toString()
    });
  }
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
  const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  console.log(`\n🔔 [${requestId}] ========== WEBHOOK REQUEST RECEIVED: ${new Date().toISOString()} ==========`);
  
  try {
    // Log detailed request information
    console.log(`🔍 [${requestId}] Request IP: ${req.ip}`);
    console.log(`🔍 [${requestId}] Request method: ${req.method}`);
    console.log(`🔍 [${requestId}] Content-Type: ${req.headers['content-type']}`);
    console.log(`🔍 [${requestId}] User-Agent: ${req.headers['user-agent']}`);
    console.log(`🔍 [${requestId}] Request headers:`, JSON.stringify(req.headers, null, 2));
    
    // Log the incoming webhook payload
    console.log(`📥 [${requestId}] Received payload:`, JSON.stringify(req.body, null, 2));
    
    // ENHANCED BYPASS: Accept all webhook messages with essential fields
    // This ensures messages are processed even when DMS server is unreachable
    if (req.body) {
      console.log(`🧐 [${requestId}] Analyzing payload contents...`);
      
      // Process message if it has any customer identification
      const hasCustomerId = !!req.body.customer_id;
      const hasCustomer = !!(req.body.customer && (req.body.customer.id || req.body.customer.profile_id));
      const messageType = req.body.type || 'unknown';
      
      console.log(`ℹ️ [${requestId}] Message info: type=${messageType}, hasCustomerId=${hasCustomerId}, hasCustomer=${hasCustomer}`);
      
      if (hasCustomerId || hasCustomer) {
        console.log(`✅ [${requestId}] Valid customer identification found, processing directly`);
        
        // Store the message in our internal store (now with deduplication)
        console.log(`📦 [${requestId}] Storing message in local queue`);
        const wasStored = storeIncomingMessage(req.body);
        
        if (!wasStored) {
          console.log(`⚠️ [${requestId}] Message was not stored (likely duplicate)`);
        }
        
        // Process message based on type if we have handlers
        if (messageType !== 'unknown') {
          console.log(`🔄 [${requestId}] Routing message to handler for type: ${messageType}`);
          
          if (messageType === 'text' && dms.onTextMessage) {
            try { 
              dms.onTextMessage(req.body); 
              console.log(`📝 [${requestId}] Text message processed successfully`);
            } catch (e) { 
              console.error(`❌ [${requestId}] Error in text handler:`, e); 
            }
          } else if (messageType === 'rich_content' && dms.onRichContentMessage) {
            try { 
              dms.onRichContentMessage(req.body); 
              console.log(`📊 [${requestId}] Rich content message processed successfully`);
            } catch (e) { 
              console.error(`❌ [${requestId}] Error in rich content handler:`, e); 
            }
          } else if (messageType === 'link_button' && dms.onUrlLinkMessage) {
            try { 
              dms.onUrlLinkMessage(req.body); 
              console.log(`🔗 [${requestId}] URL link message processed successfully`);
            } catch (e) { 
              console.error(`❌ [${requestId}] Error in URL link handler:`, e); 
            }
          } else if (messageType === 'menu' && dms.onMenuMessage) {
            try { 
              dms.onMenuMessage(req.body); 
              console.log(`📋 [${requestId}] Menu message processed successfully`);
            } catch (e) { 
              console.error(`❌ [${requestId}] Error in menu handler:`, e); 
            }
          } else {
            console.log(`⚠️ [${requestId}] No handler available for message type: ${messageType}`);
          }
        } else {
          console.log(`⚠️ [${requestId}] Unknown message type, storing only`);
        }
        
        // If this is a delivery confirmation, update message status
        if (req.body.message_id) {
          console.log(`✓ [${requestId}] Updating status for message ${req.body.message_id} to 'delivered'`);
          pendingMessages.set(req.body.message_id, 'delivered');
        }
        
        // Respond immediately with success to ensure DMS knows we got it
        console.log(`📤 [${requestId}] Sending immediate success response`);
        console.log(`✨ [${requestId}] ========== WEBHOOK PROCESSING COMPLETE ==========\n`);
        return res.status(200).send('Message processed successfully');
      } else {
        console.log(`⚠️ [${requestId}] Message lacks customer identification, attempting validation`);
      }
    } else {
      console.log(`⚠️ [${requestId}] Empty request body received`);
    }
    
    // Set a timeout for the DMS validation request
    const timeoutMs = 5000; // 5 seconds timeout
    console.log(`⏱️ [${requestId}] Setting ${timeoutMs}ms timeout for DMS validation`);
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('DMS validation timed out')), timeoutMs);
    });
    
    // Wrap the DMS processing in a promise
    console.log(`🔐 [${requestId}] Attempting DMS validation via onRequest`);
    const dmsProcessPromise = new Promise((resolve) => {
      try {
        dms.onRequest(req, (status, message) => {
          console.log(`🔐 [${requestId}] DMS validation returned: status=${status}, message=${message}`);
          resolve({ status, message });
        });
      } catch (error) {
        console.error(`❌ [${requestId}] Immediate error in DMS validation:`, error);
        resolve({ status: 500, message: error.message });
      }
    });
    
    // Race the DMS processing against the timeout
    console.log(`⏱️ [${requestId}] Waiting for DMS validation (with timeout)`);
    Promise.race([dmsProcessPromise, timeoutPromise])
      .then(({ status, message }) => {
        // Success path - DMS responded in time
        console.log(`✅ [${requestId}] DMS validation completed in time: status=${status}`);
        console.log(`📤 [${requestId}] Responding with status ${status}`);
        console.log(`✨ [${requestId}] ========== WEBHOOK PROCESSING COMPLETE ==========\n`);
        return res.status(status).send(message);
      })
      .catch(error => {
        console.error(`⏱️ [${requestId}] Error or timeout in DMS validation:`, error);
        
        // If timeout or other error, still try to store the message
        if (req.body && (req.body.customer_id || 
            (req.body.customer && req.body.customer.id) || 
            (req.body.customer && req.body.customer.profile_id))) {
          console.log(`🆘 [${requestId}] Storing message despite validation timeout/error`);
          const wasStored = storeIncomingMessage(req.body);
          if (!wasStored) {
            console.log(`⚠️ [${requestId}] Message was not stored (likely duplicate)`);
          }
          console.log(`📤 [${requestId}] Responding with success status despite timeout`);
          console.log(`✨ [${requestId}] ========== WEBHOOK PROCESSING COMPLETE ==========\n`);
          return res.status(200).send('Message accepted despite validation timeout');
        }
        
        console.log(`⌛ [${requestId}] Returning timeout status (408)`);
        console.log(`✨ [${requestId}] ========== WEBHOOK PROCESSING COMPLETE ==========\n`);
        return res.status(408).send('Request to DMS timed out');
      });
      
  } catch (err) {
    console.error(`❌ [${requestId}] Unhandled error in webhook processing:`, err);
    
    // Even if there's an error, try to store the message if it has required fields
    if (req.body && (req.body.customer_id || 
        (req.body.customer && req.body.customer.id) || 
        (req.body.customer && req.body.customer.profile_id))) {
      console.log(`🆘 [${requestId}] Attempting to store message despite error`);
      try {
        const wasStored = storeIncomingMessage(req.body);
        if (wasStored) {
          console.log(`✅ [${requestId}] Successfully stored message despite error`);
        } else {
          console.log(`⚠️ [${requestId}] Message was not stored (likely duplicate)`);
        }
      } catch (storeErr) {
        console.error(`💥 [${requestId}] Failed to store message:`, storeErr);
      }
      console.log(`📤 [${requestId}] Sending success response despite error`);
      console.log(`✨ [${requestId}] ========== WEBHOOK PROCESSING COMPLETE ==========\n`);
      return res.status(200).send('Message accepted despite error');
    }
    
    console.log(`💔 [${requestId}] Failed to process webhook, returning 500`);
    console.log(`✨ [${requestId}] ========== WEBHOOK PROCESSING COMPLETE ==========\n`);
    return res.status(500).send(err.message);
  }
});

// NEW ENDPOINT: API endpoint to ping DMS and check real connection
app.get('/api/ping', (req, res) => {
  // Check if we have the necessary configuration values AND they're not empty
  const hasValidConfig = !!(DMS_CONFIG.JWT_SECRET && DMS_CONFIG.JWT_SECRET.trim() && 
                           DMS_CONFIG.CHANNEL_ID && DMS_CONFIG.CHANNEL_ID.trim() && 
                           DMS_CONFIG.API_URL && DMS_CONFIG.API_URL.trim());
  
  if (!hasValidConfig) {
    const missingFields = [];
    if (!DMS_CONFIG.JWT_SECRET || !DMS_CONFIG.JWT_SECRET.trim()) missingFields.push('JWT_SECRET');
    if (!DMS_CONFIG.CHANNEL_ID || !DMS_CONFIG.CHANNEL_ID.trim()) missingFields.push('CHANNEL_ID');
    if (!DMS_CONFIG.API_URL || !DMS_CONFIG.API_URL.trim()) missingFields.push('API_URL');
    
    return res.json({ 
      connected: false, 
      message: `Missing or empty configuration values: ${missingFields.join(', ')}`,
      missing_fields: missingFields
    });
  }
  
  // Create a test message to ping the DMS
  const pingMessage = {
    type: 'text',
    customer_id: 'ping-test-' + Date.now(),
    message_id: 'ping-' + Date.now(),
    text: ['ping test message']
  };
  
  console.log('Attempting to ping DMS with config:', {
    API_URL: DMS_CONFIG.API_URL,
    CHANNEL_ID: DMS_CONFIG.CHANNEL_ID,
    JWT_SECRET: DMS_CONFIG.JWT_SECRET ? '****' : 'NOT SET'
  });

  // Attempt to send a ping message to DMS
  try {
    dms.sendMessage(pingMessage, (response) => {
      console.log('DMS Ping response:', response);
      
      // Check if the connection was successful
      const isConnected = response && response.status >= 200 && response.status < 300;
      
      return res.json({
        connected: isConnected,
        status: response ? response.status : 'NO_RESPONSE',
        message: response ? (response.statusText || (isConnected ? 'Connection successful' : 'Connection failed: ' + (response.data || 'Unknown error'))) : 'No response from DMS client',
        dms_response: response
      });
    });
  } catch (error) {
    console.error('Error in DMS ping:', error);
    return res.json({
      connected: false,
      status: 'ERROR',
      message: 'Error sending ping: ' + error.message,
      error_details: error.toString()
    });
  }
});

// API endpoint to get configuration
app.get('/api/config', (req, res) => {
  // Check if config values exist AND are not empty strings
  const hasValidConfig = !!(DMS_CONFIG.JWT_SECRET && DMS_CONFIG.JWT_SECRET.trim() && 
                           DMS_CONFIG.CHANNEL_ID && DMS_CONFIG.CHANNEL_ID.trim() && 
                           DMS_CONFIG.API_URL && DMS_CONFIG.API_URL.trim());
  
  res.json({
    // Only send what the client needs to know
    connected: hasValidConfig,
    config_status: {
      has_jwt_secret: !!(DMS_CONFIG.JWT_SECRET && DMS_CONFIG.JWT_SECRET.trim()),
      has_channel_id: !!(DMS_CONFIG.CHANNEL_ID && DMS_CONFIG.CHANNEL_ID.trim()),
      has_api_url: !!(DMS_CONFIG.API_URL && DMS_CONFIG.API_URL.trim())
    }
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
    messages: incomingMessages,
    processedMessageIds: Array.from(processedMessageIds),
    processedCount: processedMessageIds.size
  });
});

// NEW DEBUG Endpoint: Check deduplication status
app.get('/api/debug/deduplication', (req, res) => {
  res.json({
    totalStoredMessages: incomingMessages.length,
    uniqueMessageIds: processedMessageIds.size,
    duplicatesBlocked: Math.max(0, incomingMessages.length - processedMessageIds.size),
    recentMessages: incomingMessages.slice(-10).map(msg => ({
      message_id: msg.message_id,
      type: msg.type,
      timestamp: msg.timestamp,
      customer_id: msg.customer_id
    }))
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