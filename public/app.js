document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const configForm = document.getElementById('configForm');
    const connectionIdInput = document.getElementById('connectionId');
    const jwtSecretInput = document.getElementById('jwtSecret');
    const clientWebhookUrlInput = document.getElementById('clientWebhookUrl');
    const apiUrlInput = document.getElementById('apiUrl');
    const customerIdInput = document.getElementById('customerId');
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const sendAdvancedButton = document.getElementById('sendAdvancedButton');
    const messageTypeSelect = document.getElementById('messageType');
    const messagesContainer = document.getElementById('messagesContainer');
    const logContent = document.getElementById('logContent');
    const logTabs = document.querySelectorAll('.log-tab');
    const endSessionButton = document.querySelector('.end-session');
    const simulateCsrButton = document.querySelector('.simulate-csr');
    const clearChatButton = document.querySelector('.clear-chat');
    const typingCheckbox = document.getElementById('typingCheckbox');
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    const pingButton = document.getElementById('pingButton');

    // Application state
    let customerId = ''; // Will be loaded from config, no longer random
    let activeLogTab = 'sent'; // Default to sent tab
    let isConnected = false;
    let activeChatSession = true;
    const MESSAGE_TIMEOUT = 10000; // 10 seconds timeout for messages
    const pendingMessages = new Map(); // Track messages waiting for response
    
    // ADD: Frontend message deduplication tracking
    const processedMessageIds = new Set();
    const displayedMessageIds = new Set();

    // Initialize the application
    init();

    // Initialize application
    function init() {
        // Load saved configuration if any
        loadConfiguration();
        
        // Check connection status
        checkConnectionStatus();
        
        // Setup event listeners
        setupEventListeners();
        
        // Update input placeholder based on default message type
        updateInputPlaceholder();
        
        // Set up polling for messages (in a real app, you'd use WebSockets)
        setInterval(checkForNewMessages, 5000);

        // Check if customer ID is set and show a warning if it's not
        if (!customerId) {
            showError('Please set a Customer ID in the configuration panel and save config');
            // Visually highlight the customer ID field
            if (customerIdInput) {
                customerIdInput.classList.add('highlight-required');
                // Scroll to the customer ID field
                customerIdInput.scrollIntoView({ behavior: 'smooth' });
            }
        }
    }

    // Load saved configuration from localStorage
    function loadConfiguration() {
        try {
            const savedConfig = JSON.parse(localStorage.getItem('dmsConfig')) || {};
            
            if (savedConfig.connectionId) connectionIdInput.value = savedConfig.connectionId;
            if (savedConfig.jwtSecret) jwtSecretInput.value = savedConfig.jwtSecret;
            if (savedConfig.apiUrl) apiUrlInput.value = savedConfig.apiUrl;
            
            // Handle Customer ID
            if (savedConfig.customerId) {
                customerIdInput.value = savedConfig.customerId;
                customerId = savedConfig.customerId; // Set the global customerId
                console.log('Loaded Customer ID from saved config:', customerId);
            } else {
                // Generate a default customer ID if none exists
                const defaultCustomerId = generateRandomId();
                customerIdInput.value = defaultCustomerId;
                customerId = defaultCustomerId;
                console.log('Generated new Customer ID:', customerId);
            }
            
            // Always set the webhook URL based on the current origin
            const deployedUrl = window.location.origin; // e.g., https://your-app.onrender.com
            const webhookUrl = `${deployedUrl}/api/dms/webhook`;
            clientWebhookUrlInput.value = webhookUrl;
            
            if (savedConfig.connectionId && savedConfig.jwtSecret && savedConfig.apiUrl) {
                // Ping DMS to check actual connection status
                pingDMS();
            }
        } catch (error) {
            console.error('Error loading configuration:', error);
            // If there's an error, still generate a customer ID
            if (!customerIdInput.value) {
                const defaultCustomerId = generateRandomId();
                customerIdInput.value = defaultCustomerId;
                customerId = defaultCustomerId;
                console.log('Generated emergency Customer ID:', customerId);
            }
        }
    }

    // Check basic connection status with the server
    function checkConnectionStatus() {
        fetch('/api/config')
            .then(response => response.json())
            .then(data => {
                // If config exists, ping DMS to verify actual connection
                if (data.connected) {
                    pingDMS();
                } else {
                    isConnected = false;
                    updateConnectionStatus();
                }
            })
            .catch(error => {
                console.error('Error checking connection status:', error);
                isConnected = false;
                updateConnectionStatus();
            });
    }

    // Ping DMS to verify actual connection
    function pingDMS() {
        updateConnectionStatus(null, 'Connecting...');
        
        fetch('/api/ping')
            .then(response => response.json())
            .then(data => {
                isConnected = data.connected;
                
                // If connection failed, show the error message
                if (!isConnected) {
                    const errorMessage = data.message || 'Unknown error';
                    showError(`DMS Connection failed: ${errorMessage}`);
                    console.error('Connection test failed:', data);
                } else {
                    showStatus('Connection test successful');
                }
                
                updateConnectionStatus();
            })
            .catch(error => {
                console.error('Error pinging DMS:', error);
                isConnected = false;
                updateConnectionStatus();
                showError('Error pinging DMS: ' + error.message);
            });
    }

    // Update the UI to reflect connection status
    function updateConnectionStatus(connected = null, statusMsg = null) {
        // If connected status is provided, use it; otherwise use the global state
        const connectionStatus = connected !== null ? connected : isConnected;
        
        if (connectionStatus === null) {
            // Connecting state
            statusDot.classList.remove('disconnected');
            statusDot.classList.remove('connected');
            statusDot.classList.add('connecting');
            statusText.textContent = statusMsg || 'Connecting...';
        } else if (connectionStatus) {
            statusDot.classList.remove('disconnected');
            statusDot.classList.remove('connecting');
            statusDot.classList.add('connected');
            statusText.textContent = statusMsg || 'Connected';
        } else {
            statusDot.classList.remove('connected');
            statusDot.classList.remove('connecting');
            statusDot.classList.add('disconnected');
            statusText.textContent = statusMsg || 'Disconnected';
        }
    }

    // Setup all event listeners
    function setupEventListeners() {
        // Configuration form submission
        configForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveConfiguration();
        });
        
        // Special handling for customer ID field
        customerIdInput.addEventListener('input', function() {
            // Remove error highlighting when user starts typing
            this.classList.remove('highlight-required');
        });
        
        // Send message on button click
        sendButton.addEventListener('click', sendMessage);
        
        // Send advanced message on advanced button click
        sendAdvancedButton.addEventListener('click', sendAdvancedMessage);
        
        // Send message on Enter key
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
        
        // Log tab switching - updated to actually filter displayed logs
        logTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                activeLogTab = tab.dataset.tab;
                logTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Actually filter log entries based on tab
                const logEntries = logContent.querySelectorAll('.log-entry');
                logEntries.forEach(entry => {
                    if (entry.getAttribute('data-direction') === activeLogTab) {
                        entry.style.display = 'block';
                    } else {
                        entry.style.display = 'none';
                    }
                });
            });
        });
        
        // End session button
        endSessionButton.addEventListener('click', endSession);
        
        // Simulate CSR response button
        simulateCsrButton.addEventListener('click', simulateCsrResponse);
        
        // Clear chat button
        clearChatButton.addEventListener('click', clearChatWindow);
        
        // Typing indicator checkbox
        typingCheckbox.addEventListener('change', toggleTypingIndicator);

        // Add ping button event listener
        if (pingButton) {
            pingButton.addEventListener('click', pingDMS);
        }

        // Message type selector change handler
        messageTypeSelect.addEventListener('change', function() {
            updateInputPlaceholder();
        });
    }

    // Save configuration to server and localStorage
    function saveConfiguration() {
        // Always use the auto-generated webhook URL based on the current origin
        const deployedUrl = window.location.origin; // e.g., https://your-app.onrender.com
        const webhookUrl = `${deployedUrl}/api/dms/webhook`;
        clientWebhookUrlInput.value = webhookUrl; // Update the input field with the current URL
        
        // Update the global customerId with the input value
        customerId = customerIdInput.value.trim();
        if (!customerId) {
            // If no customer ID is provided, generate one
            customerId = generateRandomId();
            customerIdInput.value = customerId;
            showStatus(`Generated a random Customer ID: ${customerId}`);
        }
        
        const config = {
            connectionId: connectionIdInput.value.trim(),
            jwtSecret: jwtSecretInput.value.trim(),
            clientWebhookUrl: webhookUrl, // Always use the auto-generated URL
            apiUrl: apiUrlInput.value.trim(),
            customerId: customerId // Save the customer ID
        };
        
        // Save to localStorage
        localStorage.setItem('dmsConfig', JSON.stringify(config));
        
        // Send to server
        fetch('/api/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                channelId: config.connectionId,
                jwtSecret: config.jwtSecret,
                apiUrl: config.apiUrl,
                webhookUrl: webhookUrl // Always use the auto-generated URL
            })
        })
        .then(response => {
            // Check if response is OK before trying to parse JSON
            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                showStatus(`Configuration saved successfully. Webhook URL: ${webhookUrl}`);
                pingDMS(); // Ping DMS to verify actual connection after saving config
            } else {
                showError('Error saving configuration: ' + (data.message || 'Unknown error'));
            }
        })
        .catch(error => {
            console.error('Error saving configuration:', error);
            
            // More specific error message for JSON parsing errors
            if (error.message && error.message.includes('Unexpected token')) {
                showError('Error saving configuration: The server returned an invalid response. Please check the console for details.');
            } else {
                showError('Error saving configuration: ' + error.message);
            }
        });
    }

    // Send a message to DMS
    function sendMessage() {
        const text = messageInput.value.trim();
        
        if (!text || !isConnected || !activeChatSession) return;
        
        // Make sure we have a customerId before sending
        if (!customerId) {
            showError('Please set a Customer ID in the configuration panel and save config');
            // Highlight the customer ID field
            if (customerIdInput) {
                customerIdInput.classList.add('highlight-required');
                // Scroll to the customer ID field
                customerIdInput.scrollIntoView({ behavior: 'smooth' });
            }
            return;
        }
        
        const messageId = generateRandomId();
        const timestamp = new Date().toISOString();
        
        // Log message sending attempt
        console.log(`Sending message: ${messageId} - "${text}"`);
        console.log(`Using Customer ID: ${customerId}`);
        
        // Add message to UI immediately (optimistic UI update)
        addMessageToUI({
            id: messageId,
            text,
            isUser: true,
            timestamp,
            status: 'sending'
        });
        
        // Clear input field
        messageInput.value = '';
        
        // Add message to pending messages with timeout
        pendingMessages.set(messageId, {
            timestamp,
            text,
            timeoutId: setTimeout(() => {
                // If message hasn't received response within timeout period
                if (pendingMessages.has(messageId)) {
                    pendingMessages.delete(messageId);
                    updateMessageStatus(messageId, 'timeout');
                    showError(`Message timed out after ${MESSAGE_TIMEOUT/1000} seconds`);
                    console.error(`Message ${messageId} timed out waiting for response`);
                }
            }, MESSAGE_TIMEOUT)
        });
        
        // Send to server
        fetch('/api/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                customerId,
                messageId,
                text,
                customerName: 'You'
            })
        })
        .then(response => response.json())
        .then(data => {
            console.log(`Server response for message ${messageId}:`, data);
            
            // Clear timeout as we got a response
            if (pendingMessages.has(messageId)) {
                clearTimeout(pendingMessages.get(messageId).timeoutId);
                
                // Set up status polling for this message if it was sent successfully
                if (data.messageStatus === 'sent') {
                    console.log(`Message ${messageId} sent successfully to DMS. Starting polling for delivery confirmation.`);
                    // Start polling for status updates
                    startStatusPolling(messageId);
                } else {
                    console.error(`Failed to send message ${messageId} to DMS:`, data);
                    pendingMessages.delete(messageId);
                }
            }
            
            // Update message status based on server response
            updateMessageStatus(messageId, data.messageStatus || (data.status === 200 ? 'sent' : 'error'));
            
            if (data.status !== 200) {
                showError(`Error sending message: ${data.message}`);
            } else {
                // Log the sent message
                addToConsoleLog({
                    direction: 'sent',
                    message: {
                        type: 'text',
                        customer_id: customerId,
                        message_id: messageId,
                        text: [text],
                        timestamp
                    }
                });
            }
        })
        .catch(error => {
            // Clear timeout as we got a response (error)
            if (pendingMessages.has(messageId)) {
                clearTimeout(pendingMessages.get(messageId).timeoutId);
                pendingMessages.delete(messageId);
            }
            
            console.error('Error sending message:', error);
            updateMessageStatus(messageId, 'error');
            showError('Error sending message: ' + error.message);
        });
    }

    // Add function to start polling for message status
    function startStatusPolling(messageId) {
        console.log(`Starting status polling for message ${messageId}`);
        // Store the interval ID so we can clear it later
        const intervalId = setInterval(() => {
            fetch(`/api/message-status/${messageId}`)
                .then(response => response.json())
                .then(data => {
                    console.log(`Status poll for message ${messageId}: ${data.status}`);
                    if (data.status === 'delivered') {
                        // Message delivered, update UI and stop polling
                        console.log(`Message ${messageId} confirmed delivered by DMS`);
                        updateMessageStatus(messageId, 'delivered');
                        clearInterval(intervalId);
                        showStatus(`Message delivered successfully!`);
                        
                        // Clean up the pending message
                        if (pendingMessages.has(messageId)) {
                            pendingMessages.delete(messageId);
                        }
                    } else if (data.status === 'error') {
                        // Error occurred, update UI and stop polling
                        console.error(`Message ${messageId} reported error status by DMS`);
                        updateMessageStatus(messageId, 'error');
                        clearInterval(intervalId);
                        
                        // Clean up the pending message
                        if (pendingMessages.has(messageId)) {
                            pendingMessages.delete(messageId);
                        }
                    }
                    // If status is still 'sent' or 'unknown', keep polling
                })
                .catch(error => {
                    console.error(`Error checking status for message ${messageId}:`, error);
                    // Don't stop polling on temporary errors
                });
        }, 3000); // Check every 3 seconds
        
        // Store the interval ID with the message for cleanup
        if (pendingMessages.has(messageId)) {
            pendingMessages.get(messageId).statusIntervalId = intervalId;
            
            // Set a timeout to stop polling after 60 seconds (to prevent infinite polling)
            setTimeout(() => {
                if (pendingMessages.has(messageId) && pendingMessages.get(messageId).statusIntervalId) {
                    console.log(`Stopping status polling for message ${messageId} after timeout`);
                    clearInterval(pendingMessages.get(messageId).statusIntervalId);
                    updateMessageStatus(messageId, 'unknown');
                    showStatus(`Message status unknown. DMS may not be responding.`);
                    pendingMessages.delete(messageId);
                }
            }, 60000);
        }
    }

    // Check for new messages from the server
    function checkForNewMessages() {
        if (!isConnected || !activeChatSession) return;
        
        // Track when we last checked for messages with more precision
        if (!window.lastMessageCheck) {
            window.lastMessageCheck = new Date(0).toISOString(); // Start from beginning of time
        }
        
        // Fetch new messages for this customer
        fetch(`/api/messages/${customerId}?since=${encodeURIComponent(window.lastMessageCheck)}`)
            .then(response => response.json())
            .then(data => {
                if (data.messages && data.messages.length > 0) {
                    console.log(`📨 Received ${data.messages.length} new messages from server`);
                    
                    // Enhanced timestamp updating - add a small buffer to prevent re-fetching the same messages
                    const timestamps = data.messages.map(msg => new Date(msg.timestamp).getTime());
                    const latestTimestamp = Math.max(...timestamps);
                    // Add 1 millisecond to ensure we don't fetch the same message again
                    window.lastMessageCheck = new Date(latestTimestamp + 1).toISOString();
                    
                    console.log(`📅 Updated lastMessageCheck to: ${window.lastMessageCheck}`);
                    
                    // Process and display each message
                    data.messages.forEach(message => {
                        processIncomingMessage(message);
                    });
                } else {
                    console.log(`📭 No new messages found for customer ${customerId}`);
                }
            })
            .catch(error => {
                console.error('Error checking for new messages:', error);
            });
    }

    // Process incoming message from DMS
    function processIncomingMessage(message) {
        console.log('Processing incoming message:', message);
        
        // CRITICAL FIX: Check for duplicate message IDs
        if (message.message_id && processedMessageIds.has(message.message_id)) {
            console.log(`🚫 Frontend: Duplicate message ID detected: ${message.message_id}. Skipping processing.`);
            return;
        }
        
        // Mark this message as processed
        if (message.message_id) {
            processedMessageIds.add(message.message_id);
        }
        
        switch (message.type) {
            case 'text':
                // Display text message from CSR/bot
                addMessageToUI({
                    id: message.message_id,
                    text: Array.isArray(message.text) ? message.text.join('\n') : message.text,
                    isUser: false,
                    timestamp: message.timestamp,
                    status: 'received',
                    sender: message.csr_name || 'Agent'
                });
                
                // Add to console log
                addToConsoleLog({
                    direction: 'received',
                    message: message
                });
                break;
                
            case 'link_button':
                // Display link message
                addMessageToUI({
                    id: message.message_id,
                    type: 'link_button',
                    title: message.title,
                    label: message.label,
                    url: message.url,
                    isUser: false,
                    timestamp: message.timestamp,
                    status: 'received',
                    sender: message.csr_name || 'Agent'
                });
                
                // Add to console log
                addToConsoleLog({
                    direction: 'received',
                    message: message
                });
                break;
                
            case 'menu':
                // Display menu message with buttons
                addMessageToUI({
                    id: message.message_id,
                    type: 'menu',
                    title: message.title,
                    items: message.items,
                    isUser: false,
                    timestamp: message.timestamp,
                    status: 'received',
                    sender: message.author === 'bot' ? 'Bot' : (message.csr_name || 'Agent')
                });
                
                // Add to console log
                addToConsoleLog({
                    direction: 'received',
                    message: message
                });
                break;
                
            case 'typing_indicator':
                // Show typing indicator
                showTypingIndicator(true);
                
                // Auto-hide after 3 seconds
                setTimeout(() => {
                    showTypingIndicator(false);
                }, 3000);
                break;
                
            case 'end_session':
                // End the session
                endSession();
                showStatus('Agent has ended the conversation');
                break;
                
            default:
                console.log(`Unknown message type: ${message.type}`);
                // Try to display as a text message anyway
                if (message.text || message.content?.text) {
                    addMessageToUI({
                        id: message.message_id,
                        text: message.text || message.content?.text,
                        isUser: false,
                        timestamp: message.timestamp,
                        status: 'received',
                        sender: message.csr_name || 'Agent'
                    });
                }
        }
    }

    // Show/hide typing indicator
    function showTypingIndicator(show) {
        // Remove existing typing indicator if present
        const existingIndicator = document.getElementById('typingIndicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        
        if (show) {
            const typingElement = document.createElement('div');
            typingElement.classList.add('typing');
            typingElement.innerHTML = `
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            `;
            typingElement.id = 'typingIndicator';
            
            // Add to messages container
            messagesContainer.appendChild(typingElement);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    // Add a message to the UI
    function addMessageToUI(message) {
        // FINAL PROTECTION: Check if this message ID is already displayed
        if (message.id && displayedMessageIds.has(message.id)) {
            console.log(`🚫 UI: Message ${message.id} already displayed. Skipping duplicate.`);
            return;
        }
        
        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
        messageElement.classList.add(message.isUser ? 'user-message' : 'system-message');
        
        if (message.id) {
            messageElement.setAttribute('data-message-id', message.id);
            // Track that we've displayed this message
            displayedMessageIds.add(message.id);
        }
        
        // Different rendering based on message type
        if (message.type === 'link_button') {
            messageElement.innerHTML = `
                <div class="link-message">
                    <div>${message.title || ''}</div>
                    <a href="${message.url}" target="_blank" class="link-button">${message.label}</a>
                </div>
                <div class="message-info">
                    ${message.sender ? `<span class="message-sender">${message.sender}</span> • ` : ''}
                    ${formatTimestamp(message.timestamp)} ${message.status ? `• <span class="status-${message.status}">${message.status}</span>` : ''}
                </div>
            `;
        } else if (message.type === 'menu') {
            let buttonsHTML = '';
            if (message.items && Array.isArray(message.items)) {
                buttonsHTML = message.items.map(item => {
                    return `<button class="menu-button" data-payload="${item.payload || item.text}">${item.text}</button>`;
                }).join('');
            }
            
            messageElement.innerHTML = `
                <div class="menu-message">
                    <div class="menu-title">${message.title || ''}</div>
                    <div class="menu-buttons">${buttonsHTML}</div>
                </div>
                <div class="message-info">
                    ${message.sender ? `<span class="message-sender">${message.sender}</span> • ` : ''}
                    ${formatTimestamp(message.timestamp)} ${message.status ? `• <span class="status-${message.status}">${message.status}</span>` : ''}
                </div>
            `;
            
            // Add event listeners to menu buttons
            setTimeout(() => {
                const buttons = messageElement.querySelectorAll('.menu-button');
                buttons.forEach(button => {
                    button.addEventListener('click', function() {
                        const payload = this.getAttribute('data-payload');
                        if (payload) {
                            // Set the message input to the payload
                            messageInput.value = payload;
                            // Send the message
                            sendMessage();
                        }
                    });
                });
            }, 100);
        } else {
            messageElement.innerHTML = `
                <div>${Array.isArray(message.text) ? message.text.join('<br>') : message.text}</div>
                <div class="message-info">
                    ${message.sender ? `<span class="message-sender">${message.sender}</span> • ` : ''}
                    ${formatTimestamp(message.timestamp)} ${message.status ? `• <span class="status-${message.status}">${message.status}</span>` : ''}
                </div>
            `;
        }
        
        // Add to messages container
        messagesContainer.appendChild(messageElement);
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Update a message's status in the UI
    function updateMessageStatus(messageId, status) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        
        if (messageElement) {
            const messageInfoElement = messageElement.querySelector('.message-info');
            if (messageInfoElement) {
                // Update message info with proper status class
                const timestamp = messageInfoElement.textContent.split('•')[0].trim();
                messageInfoElement.innerHTML = `${timestamp} • <span class="status-${status}">${status}</span>`;
            }
        }
    }

    // Add a message to the console log
    function addToConsoleLog(logEntry) {
        const { direction, message } = logEntry;
        
        const logElement = document.createElement('div');
        logElement.classList.add('log-entry');
        logElement.setAttribute('data-direction', direction); // Add direction attribute for filtering
        
        let timestamp = new Date().toISOString();
        if (message.timestamp) {
            timestamp = message.timestamp;
        }
        
        logElement.innerHTML = `
            <div class="log-timestamp">[${formatTimestamp(timestamp)}]</div>
            <div class="log-content">${JSON.stringify(message, null, 2)}</div>
        `;
        
        // Add to console log
        logContent.appendChild(logElement);
        
        // Scroll to bottom
        logContent.scrollTop = logContent.scrollHeight;
        
        // Update visibility based on active tab
        if (direction !== activeLogTab) {
            logElement.style.display = 'none';
        }
    }

    // Show a status message in the UI
    function showStatus(message) {
        const statusElement = document.createElement('div');
        statusElement.classList.add('chat-status');
        statusElement.textContent = message;
        
        messagesContainer.appendChild(statusElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Show an error message in the UI
    function showError(message) {
        const errorElement = document.createElement('div');
        errorElement.classList.add('error-message');
        errorElement.textContent = message;
        
        messagesContainer.appendChild(errorElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // End the current chat session
    function endSession() {
        if (!activeChatSession) return;
        
        activeChatSession = false;
        showStatus('Chat session ended');
        
        // Disable message input
        messageInput.disabled = true;
        sendButton.disabled = true;
    }

    // Simulate a CSR response
    function simulateCsrResponse() {
        if (!activeChatSession) return;
        
        const responses = [
            "Thank you for your message. How can I help you today?",
            "I'll look into that for you right away.",
            "Could you please provide more information?",
            "I understand your concern. Let me check what we can do.",
            "Is there anything else you'd like to know?"
        ];
        
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        const timestamp = new Date().toISOString();
        const messageId = generateRandomId();
        
        // Add message to UI
        addMessageToUI({
            id: messageId,
            text: randomResponse,
            isUser: false,
            timestamp,
            status: 'received'
        });
        
        // Add to console log
        addToConsoleLog({
            direction: 'received',
            message: {
                type: 'text',
                customer_id: customerId,
                message_id: messageId,
                csr_name: 'Agent',
                text: [randomResponse],
                timestamp
            }
        });
    }

    // Toggle the typing indicator
    function toggleTypingIndicator() {
        if (!activeChatSession) return;
        
        if (typingCheckbox.checked) {
            // Show typing indicator
            const typingElement = document.createElement('div');
            typingElement.classList.add('typing');
            typingElement.innerHTML = `
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            `;
            typingElement.id = 'typingIndicator';
            
            // Add to messages container
            messagesContainer.appendChild(typingElement);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        } else {
            // Remove typing indicator
            const typingElement = document.getElementById('typingIndicator');
            if (typingElement) {
                typingElement.remove();
            }
        }
    }

    // Helper function to format timestamp
    function formatTimestamp(timestamp) {
        try {
            const date = new Date(timestamp);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (error) {
            return '';
        }
    }

    // Helper function to generate a random ID
    function generateRandomId() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    // Clear the chat window
    function clearChatWindow() {
        // Clear the messages container
        messagesContainer.innerHTML = '<div class="chat-status">Chat session started. Send a message to begin.</div>';
        
        // Reset tracking variables
        processedMessageIds.clear();
        displayedMessageIds.clear();
        
        // Clear console log
        logContent.innerHTML = '';
        
        // Reset last message check timestamp
        window.lastMessageCheck = new Date(0).toISOString();
        
        // Show status message
        showStatus('Chat window cleared successfully');
        
        console.log('🧹 Chat window cleared - All messages and tracking data reset');
    }

    // Send advanced message with different payload types
    function sendAdvancedMessage() {
        if (!isConnected || !activeChatSession) return;
        
        // Make sure we have a customerId before sending
        if (!customerId) {
            showError('Please set a Customer ID in the configuration panel and save config');
            if (customerIdInput) {
                customerIdInput.classList.add('highlight-required');
                customerIdInput.scrollIntoView({ behavior: 'smooth' });
            }
            return;
        }
        
        const messageType = messageTypeSelect.value;
        const text = messageInput.value.trim();
        const messageId = generateRandomId();
        const timestamp = new Date().toISOString();
        
        let payload = {};
        let displayText = '';
        
        // Build payload based on selected message type
        switch (messageType) {
            case 'text':
                if (!text) {
                    showError('Please enter a message text');
                    return;
                }
                payload = {
                    type: 'text',
                    customer_id: customerId,
                    customer_name: 'Test Customer',
                    message_id: messageId,
                    text: [text]
                };
                displayText = text;
                break;
                
            case 'text_with_attachment':
                if (!text) {
                    showError('Please enter a message text');
                    return;
                }
                payload = {
                    type: 'text',
                    customer_id: customerId,
                    customer_name: 'Test Customer',
                    message_id: messageId,
                    text: [text],
                    attachments: [
                        {
                            url: 'https://example.com/sample-document.pdf'
                        }
                    ]
                };
                displayText = `${text} (with attachment: sample-document.pdf)`;
                break;
                
            case 'text_with_context':
                if (!text) {
                    showError('Please enter a message text');
                    return;
                }
                payload = {
                    type: 'text',
                    customer_id: customerId,
                    customer_name: 'Test Customer',
                    message_id: messageId,
                    text: [text],
                    context_data: {
                        source: 'web_client',
                        session_id: generateRandomId(),
                        user_agent: navigator.userAgent
                    }
                };
                displayText = `${text} (with context data)`;
                break;
                
            case 'menu_postback':
                if (!text) {
                    showError('Please enter a postback value (e.g., "option_1", "billing_help")');
                    return;
                }
                payload = {
                    type: 'text',
                    customer_id: customerId,
                    customer_name: 'Test Customer',
                    message_id: messageId,
                    postback: text
                };
                displayText = `Menu selection: ${text}`;
                break;
                
            case 'typing_indicator':
                payload = {
                    type: 'typing_indicator',
                    customer_id: customerId
                };
                displayText = 'Typing indicator sent';
                break;
                
            case 'customer_end_session':
                payload = {
                    type: 'customer_end_session',
                    customer_id: customerId
                };
                displayText = 'Customer ended session';
                break;
                
            default:
                showError('Unknown message type selected');
                return;
        }
        
        console.log(`Sending ${messageType} payload:`, JSON.stringify(payload, null, 2));
        
        // Add message to UI immediately (optimistic UI update) - except for typing indicator
        if (messageType !== 'typing_indicator') {
            addMessageToUI({
                id: messageId,
                text: displayText,
                isUser: true,
                timestamp,
                status: 'sending'
            });
        }
        
        // Clear input field
        messageInput.value = '';
        
        // Send to server using the same endpoint but with advanced payload
        fetch('/api/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                customerId: payload.customer_id,
                messageId: payload.message_id || messageId,
                text: payload.text || [displayText],
                customerName: payload.customer_name || 'Test Customer',
                // Include the full payload for advanced processing
                advancedPayload: payload
            })
        })
        .then(response => response.json())
        .then(data => {
            console.log(`Server response for ${messageType} message:`, data);
            
            if (messageType !== 'typing_indicator') {
                // Update message status based on server response  
                updateMessageStatus(messageId, data.messageStatus || (data.status === 200 ? 'sent' : 'error'));
            }
            
            if (data.status !== 200) {
                showError(`Error sending ${messageType} message: ${data.message}`);
            } else {
                // Log the sent message
                addToConsoleLog({
                    direction: 'sent',
                    message: payload
                });
                
                // Show success message
                const messageTypeName = messageType.replace('_', ' ');
                if (data.messageStatus === 'sent') {
                    showStatus(`${messageTypeName} sent successfully!`);
                } else {
                    showStatus(`${messageTypeName} sent successfully!`);
                }
            }
        })
        .catch(error => {
            console.error(`Error sending ${messageType} message:`, error);
            if (messageType !== 'typing_indicator') {
                updateMessageStatus(messageId, 'error');
            }
            showError(`Error sending ${messageType} message: ` + error.message);
        });
    }

    // Update input placeholder based on message type
    function updateInputPlaceholder() {
        const messageType = messageTypeSelect.value;
        const placeholders = {
            'text': 'Type your message here...',
            'text_with_attachment': 'Type your message here (attachment will be added automatically)...',
            'text_with_context': 'Type your message here (context data will be added automatically)...',
            'menu_postback': 'Enter postback value (e.g., "option_1", "billing_help")...',
            'typing_indicator': 'No text needed - just click the advanced send button',
            'customer_end_session': 'No text needed - just click the advanced send button'
        };
        
        messageInput.placeholder = placeholders[messageType] || 'Type your message here...';
        
        // Disable input for certain message types
        if (messageType === 'typing_indicator' || messageType === 'customer_end_session') {
            messageInput.disabled = true;
            messageInput.style.opacity = '0.6';
        } else {
            messageInput.disabled = false;
            messageInput.style.opacity = '1';
        }
    }
}); 