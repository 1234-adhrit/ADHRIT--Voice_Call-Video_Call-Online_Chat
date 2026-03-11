# CallSpace

Business-ready voice and video calling with chat and image sharing. Built with WebRTC, Socket.IO, and Express.

## Features
- Name required before starting or joining a call
- Start or join a room with a short code
- Voice or video mode
- Real-time chat with image sending (2MB max per image)
- Responsive, production-grade UI

## Tech Stack
- Node.js (>= 18)
- Express
- Socket.IO
- WebRTC (browser APIs)

## Local Run
1. Install dependencies:
   - `npm install`
2. Start the server:
   - `npm start`
3. Open the app:
   - `http://localhost:3000`

## How It Works
- The server serves the UI from `public/`.
- Socket.IO is used for signaling (WebRTC offer/answer/ICE) and chat.
- WebRTC handles the actual voice and video stream.

## Deploy to Render
1. Push this repo to GitHub.
2. In Render, create a **New Web Service** from your repo.
3. Use these settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Node Version: 18+
4. Deploy. Render will give you a public URL.

Render will set the `PORT` env var automatically. This app uses `process.env.PORT` in `server.js`, so no changes are required.

## Optional: TURN Server for Production
For business usage, add a TURN server so calls work reliably on strict networks:
- Update the `iceServers` list in `public/app.js`.
- Services like Twilio, Xirsys, or self-hosted coturn can be used.

## Project Structure
- `server.js` - Express + Socket.IO server
- `public/index.html` - UI
- `public/styles.css` - Styling
- `public/app.js` - WebRTC + chat logic

## Go Online

- https://adhrit-voice-call-video-call-online-chat.onrender.com

## License
MIT
