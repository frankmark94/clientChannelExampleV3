document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const configForm = document.getElementById('configForm');
    const connectionIdInput = document.getElementById('connectionId');
    const jwtSecretInput = document.getElementById('jwtSecret');
    const clientWebhookUrlInput = document.getElementById('clientWebhookUrl');
    const apiUrlInput = document.getElementById('apiUrl');
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const messagesContainer = document.getElementById('messagesContainer');
    const logContent = document.getElementById('logContent');
    const logTabs = document.querySelectorAll('.log-tab');
    const endSessionButton = document.querySelector('.end-session');
    const simulateCsrButton = document.querySelector('.simulate-csr');
    const typingCheckbox = document.getElementById('typingCheckbox');
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    const pingButton = document.getElementById('pingButton');

    // Application state
    let customerId = generateRandomId(); // Generate a unique customer ID
    let activeLogTab = 'sent'; // Default to sent tab
    let isConnected = false;
    let activeChatSession = true;
    const MESSAGE_TIMEOUT = 10000; // 10 seconds timeout for messages
    const pendingMessages = new Map(); // Track messages waiting for response

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
        
        // Set up polling for messages (in a real app, you'd use WebSockets)
        setInterval(checkForNewMessages, 5000);
    }

    // Load saved configuration from localStorage
    function loadConfiguration() {
        try {
            const savedConfig = JSON.parse(localStorage.getItem('dmsConfig')) || {};
            
            if (savedConfig.connectionId) connectionIdInput.value = savedConfig.connectionId;
            if (savedConfig.jwtSecret) jwtSecretInput.value = savedConfig.jwtSecret;
            if (savedConfig.clientWebhookUrl) clientWebhookUrlInput.value = savedConfig.clientWebhookUrl;
            if (savedConfig.apiUrl) apiUrlInput.value = savedConfig.apiUrl;
            
            if (savedConfig.connectionId && savedConfig.jwtSecret && savedConfig.apiUrl) {
                // Ping DMS to check actual connection status
                pingDMS();
            }
        } catch (error) {
            console.error('Error loading configuration:', error);
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
        
        // Send message on button click
        sendButton.addEventListener('click', sendMessage);
        
        // Send message on Enter key
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
        
        // Log tab switching
        logTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                activeLogTab = tab.dataset.tab;
                logTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                // In a real app, you'd update the log content based on the active tab
            });
        });
        
        // End session button
        endSessionButton.addEventListener('click', endSession);
        
        // Simulate CSR response button
        simulateCsrButton.addEventListener('click', simulateCsrResponse);
        
        // Typing indicator checkbox
        typingCheckbox.addEventListener('change', toggleTypingIndicator);

        // Add ping button event listener
        if (pingButton) {
            pingButton.addEventListener('click', pingDMS);
        }
    }

    // Save configuration to server and localStorage
    function saveConfiguration() {
        const config = {
            connectionId: connectionIdInput.value.trim(),
            jwtSecret: jwtSecretInput.value.trim(),
            clientWebhookUrl: clientWebhookUrlInput.value.trim(),
            apiUrl: apiUrlInput.value.trim()
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
                apiUrl: config.apiUrl
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showStatus('Configuration saved successfully');
                pingDMS(); // Ping DMS to verify actual connection after saving config
            } else {
                showError('Error saving configuration');
            }
        })
        .catch(error => {
            console.error('Error saving configuration:', error);
            showError('Error saving configuration: ' + error.message);
        });
    }

    // Send a message to DMS
    function sendMessage() {
        const text = messageInput.value.trim();
        
        if (!text || !isConnected || !activeChatSession) return;
        
        const messageId = generateRandomId();
        const timestamp = new Date().toISOString();
        
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
            timeoutId: setTimeout(() => {
                // If message hasn't received response within timeout period
                if (pendingMessages.has(messageId)) {
                    pendingMessages.delete(messageId);
                    updateMessageStatus(messageId, 'timeout');
                    showError(`Message timed out after ${MESSAGE_TIMEOUT/1000} seconds`);
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
            // Clear timeout as we got a response
            if (pendingMessages.has(messageId)) {
                clearTimeout(pendingMessages.get(messageId).timeoutId);
                pendingMessages.delete(messageId);
            }
            
            // Update message status with proper color coding
            const status = data.status === 200 ? 'delivered' : 'error';
            updateMessageStatus(messageId, status);
            
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

    // Check for new messages from the server
    function checkForNewMessages() {
        // In a real application, this would be implemented with WebSockets
        // or server-sent events instead of polling
        
        // For this demo, we'll simulate messages coming in
        // In a real app, you'd make an API call to get new messages
    }

    // Add a message to the UI
    function addMessageToUI(message) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
        messageElement.classList.add(message.isUser ? 'user-message' : 'system-message');
        
        if (message.id) {
            messageElement.setAttribute('data-message-id', message.id);
        }
        
        // Different rendering based on message type
        if (message.type === 'link_button') {
            messageElement.innerHTML = `
                <div class="link-message">
                    <div>${message.title || ''}</div>
                    <a href="${message.url}" target="_blank" class="link-button">${message.label}</a>
                </div>
                <div class="message-info">
                    ${formatTimestamp(message.timestamp)} ${message.status ? `• <span class="status-${message.status}">${message.status}</span>` : ''}
                </div>
            `;
        } else {
            messageElement.innerHTML = `
                <div>${Array.isArray(message.text) ? message.text.join('<br>') : message.text}</div>
                <div class="message-info">
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
}); 