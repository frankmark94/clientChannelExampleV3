# Client Channel API Playground

A testing playground for Pega's Client Channel API that connects with the Digital Messaging Service (DMS).

## Features

- Configuration panel for Client Channel API credentials
- Real-time chat interface with message status tracking
- Console logging of sent/received messages
- Simulation of CSR responses
- Typing indicators
- End session functionality
- Connection status with real-time verification

## Tech Stack

- Node.js with Express for the server
- Vanilla JavaScript, HTML, and CSS for the frontend
- dms-client-channel npm package for API integration

## Prerequisites

- Node.js (version 14 or higher)
- NPM (comes with Node.js)

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/client-channel-api-playground.git
   cd client-channel-api-playground
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file with your credentials:
   ```
   PORT=3000
   JWT_SECRET=your_jwt_secret_here
   CHANNEL_ID=your_channel_id_here
   API_URL=your_api_url_here
   ```

4. Start the development server:
   ```
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:3000`

## Configuration

To use the playground with the Digital Messaging Service, you need to obtain the following credentials from the Pega Digital Messaging Manager portal:

- **Connection ID (Channel ID)**: Your unique channel identifier
- **JWT Secret**: The secret key for JWT token validation
- **Digital Messaging URL**: The API endpoint for sending messages (typically `https://incoming.artemis.pega.digital/messages`)
- **Client Webhook URL**: Your application's webhook endpoint that receives messages from DMS

## Local Development with ngrok

For local testing and development, you can use a service like ngrok to make your localhost publicly accessible for webhook callbacks from DMS:

1. Install ngrok: `npm install -g ngrok`
2. Start your local server: `npm run dev`
3. In a separate terminal, start ngrok: `ngrok http 3000`
4. Copy the ngrok URL (e.g., `https://abc123.ngrok.io`) and use it as your Client Webhook URL
5. Update your DMS configuration with this webhook URL

## Deployment Options

### GitHub

1. Create a new repository on GitHub
2. Initialize git in your local project if you haven't already:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   ```
3. Add your GitHub repository as remote and push:
   ```
   git remote add origin https://github.com/yourusername/client-channel-api-playground.git
   git push -u origin main
   ```

### Deployment to Render.com

This project includes a `render.yaml` configuration file for easy deployment to Render.com:

1. Create a new account on [Render.com](https://render.com) if you don't have one
2. Connect your GitHub repository to Render
3. Render will automatically detect the configuration
4. Set the following environment variables in the Render dashboard:
   - `JWT_SECRET`
   - `CHANNEL_ID`
   - `API_URL`
5. Deploy the service

Alternatively, you can manually create a new Web Service on Render:
1. Connect your GitHub repository
2. Use the following settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment Variables: Add the required variables

## Usage

1. Enter your Client Channel API credentials in the configuration panel
2. Click "Save Config" to establish a connection
3. Click "Test Connection" to verify connectivity with DMS
4. Once connected (green status dot), you can send messages
5. View response statuses and console logs for detailed information
6. Use the "Simulate CSR Response" button to test receiving messages

## License

This project is licensed under the MIT License.

## Acknowledgements

- [Pega Digital Messaging Service](https://docs.pega.com/bundle/platform/page/platform/conversational-channels/client-channel-api.html)
- [dms-client-channel npm package](https://www.npmjs.com/package/dms-client-channel) 