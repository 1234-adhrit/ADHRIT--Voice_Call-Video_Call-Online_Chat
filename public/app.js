const elements = {
  displayName: document.getElementById("displayName"),
  roomCode: document.getElementById("roomCode"),
  startVideo: document.getElementById("startVideo"),
  startVoice: document.getElementById("startVoice"),
  joinCall: document.getElementById("joinCall"),
  nameHint: document.getElementById("nameHint"),
  typeVideo: document.getElementById("typeVideo"),
  typeVoice: document.getElementById("typeVoice"),
  localVideo: document.getElementById("localVideo"),
  remoteVideo: document.getElementById("remoteVideo"),
  localLabel: document.getElementById("localLabel"),
  remoteLabel: document.getElementById("remoteLabel"),
  toggleMic: document.getElementById("toggleMic"),
  toggleCam: document.getElementById("toggleCam"),
  endCall: document.getElementById("endCall"),
  roomCodeDisplay: document.getElementById("roomCodeDisplay"),
  copyCode: document.getElementById("copyCode"),
  connectionStatus: document.getElementById("connectionStatus"),
  chatStatus: document.getElementById("chatStatus"),
  chatMessages: document.getElementById("chatMessages"),
  chatText: document.getElementById("chatText"),
  chatImage: document.getElementById("chatImage"),
  attachImage: document.getElementById("attachImage"),
  sendMessage: document.getElementById("sendMessage")
};

const state = {
  name: "",
  roomId: "",
  callType: "video",
  isHost: false,
  inCall: false,
  isBusy: false,
  localStream: null,
  pc: null,
  mediaPromise: null,
  micEnabled: true,
  camEnabled: true
};

let socket = null;

const iceServers = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" }
];

function setConnectionStatus(text, mode) {
  elements.connectionStatus.textContent = text;
  elements.connectionStatus.classList.remove("online", "busy");
  if (mode) {
    elements.connectionStatus.classList.add(mode);
  }
}

function setChatStatus(text) {
  elements.chatStatus.textContent = text;
}

function setRoomCodeDisplay(code) {
  elements.roomCodeDisplay.textContent = code || "-";
}

function updateNameState() {
  state.name = elements.displayName.value.trim();
  const hasName = state.name.length > 0;
  const disabled = !hasName || state.inCall || state.isBusy;
  elements.startVideo.disabled = disabled;
  elements.startVoice.disabled = disabled;
  elements.joinCall.disabled = disabled;
  elements.nameHint.textContent = hasName
    ? "Ready to start or join."
    : "Name is required before you can start or join.";
}

function setBusy(isBusy) {
  state.isBusy = isBusy;
  updateNameState();
}

function setCallType(type) {
  state.callType = type;
  elements.typeVideo.classList.toggle("active", type === "video");
  elements.typeVoice.classList.toggle("active", type === "voice");
}

function setInCallUI(inCall) {
  elements.chatText.disabled = !inCall;
  elements.sendMessage.disabled = !inCall;
  elements.attachImage.disabled = !inCall;
  elements.toggleMic.disabled = !inCall;
  elements.endCall.disabled = !inCall;
  updateTrackButtons();
}

function updateTrackButtons() {
  const hasVideo = !!(
    state.localStream &&
    state.localStream.getVideoTracks().length > 0
  );
  elements.toggleCam.disabled = !state.inCall || !hasVideo;
  elements.toggleMic.textContent = state.micEnabled ? "Mute" : "Unmute";
  elements.toggleCam.textContent = state.camEnabled ? "Camera Off" : "Camera On";
}

function addMessage({ name, text, image, from, system }) {
  const wrapper = document.createElement("div");
  wrapper.className = "message";
  if (from === "me") wrapper.classList.add("me");
  if (system) wrapper.classList.add("system");

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = name || "System";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (image) {
    const img = document.createElement("img");
    img.src = image;
    img.alt = "Chat image";
    bubble.appendChild(img);
  } else {
    bubble.textContent = text;
  }

  wrapper.appendChild(meta);
  wrapper.appendChild(bubble);
  elements.chatMessages.appendChild(wrapper);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function addSystemMessage(text) {
  addMessage({ name: "System", text, system: true });
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function ensureSocket() {
  if (socket) return;
  socket = io();

  socket.on("connect", () => {
    setConnectionStatus("Online", "online");
  });

  socket.on("disconnect", () => {
    setConnectionStatus("Offline");
  });

  socket.on("room-joined", ({ roomId }) => {
    state.inCall = true;
    setBusy(false);
    setInCallUI(true);
    setRoomCodeDisplay(roomId);
    setChatStatus(`Connected to room ${roomId}`);
    addSystemMessage(`You joined room ${roomId}.`);
    updateNameState();
  });

  socket.on("peer-joined", async ({ name }) => {
    addSystemMessage(`${name} joined the call.`);
    await ensurePeerConnection();
    if (state.isHost) {
      const offer = await state.pc.createOffer();
      await state.pc.setLocalDescription(offer);
      socket.emit("signal-offer", { roomId: state.roomId, offer });
    }
  });

  socket.on("peer-left", ({ name }) => {
    addSystemMessage(`${name} left the call.`);
    clearRemoteVideo();
    setConnectionStatus("Online", "online");
  });

  socket.on("signal-offer", async ({ offer }) => {
    await ensurePeerConnection();
    await state.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await state.pc.createAnswer();
    await state.pc.setLocalDescription(answer);
    socket.emit("signal-answer", { roomId: state.roomId, answer });
  });

  socket.on("signal-answer", async ({ answer }) => {
    if (!state.pc) return;
    await state.pc.setRemoteDescription(new RTCSessionDescription(answer));
  });

  socket.on("signal-ice", async ({ candidate }) => {
    if (!state.pc || !candidate) return;
    try {
      await state.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error(err);
    }
  });

  socket.on("room-full", () => {
    addSystemMessage("That room is full. Try another code.");
    endCall();
  });

  socket.on("join-error", ({ message }) => {
    addSystemMessage(message || "Unable to join the room.");
    endCall();
  });

  socket.on("chat-message", ({ message, name }) => {
    addMessage({ name, text: message });
  });

  socket.on("chat-image", ({ dataUrl, name }) => {
    addMessage({ name, image: dataUrl });
  });

  socket.on("chat-error", ({ message }) => {
    addSystemMessage(message || "Chat message failed.");
  });
}

async function prepareLocalMedia(mode) {
  if (state.mediaPromise) return state.mediaPromise;
  const constraints = {
    audio: true,
    video: mode === "video"
  };

  state.mediaPromise = navigator.mediaDevices
    .getUserMedia(constraints)
    .then((stream) => {
      state.localStream = stream;
      elements.localVideo.srcObject = stream;
      elements.localLabel.textContent = state.name || "You";
      state.micEnabled = true;
      state.camEnabled = mode === "video";
      updateTrackButtons();
      return stream;
    })
    .catch((err) => {
      addSystemMessage(
        "Microphone or camera access was blocked. Please allow permissions."
      );
      setChatStatus("Permissions needed");
      throw err;
    });

  return state.mediaPromise;
}

async function ensurePeerConnection() {
  if (state.pc) return state.pc;
  await state.mediaPromise;

  const pc = new RTCPeerConnection({ iceServers });
  state.pc = pc;

  if (state.localStream) {
    state.localStream.getTracks().forEach((track) => {
      pc.addTrack(track, state.localStream);
    });
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("signal-ice", {
        roomId: state.roomId,
        candidate: event.candidate
      });
    }
  };

  pc.ontrack = (event) => {
    const [stream] = event.streams;
    elements.remoteVideo.srcObject = stream;
    elements.remoteLabel.textContent = "Connected";
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") {
      setConnectionStatus("In Call", "busy");
    } else if (pc.connectionState === "disconnected") {
      setConnectionStatus("Reconnecting", "busy");
    } else if (pc.connectionState === "failed") {
      setConnectionStatus("Connection Failed");
    }
  };

  return pc;
}

function clearRemoteVideo() {
  elements.remoteVideo.srcObject = null;
  elements.remoteLabel.textContent = "Waiting for a guest";
}

function ensureName() {
  if (!state.name) {
    addSystemMessage("Please enter your name before starting a call.");
    return false;
  }
  return true;
}

async function startCall(mode) {
  if (!ensureName()) return;
  if (state.inCall) return;

  setBusy(true);
  state.isHost = true;
  state.roomId = generateRoomCode();
  setCallType(mode);
  setRoomCodeDisplay(state.roomId);
  setChatStatus("Setting up your room...");

  ensureSocket();

  try {
    await prepareLocalMedia(mode);
  } catch (err) {
    setBusy(false);
    return;
  }

  socket.emit("join-room", {
    roomId: state.roomId,
    name: state.name,
    callType: mode
  });
}

async function joinCall() {
  if (!ensureName()) return;
  if (state.inCall) return;

  const code = elements.roomCode.value.trim().toUpperCase();
  if (!code) {
    addSystemMessage("Enter a room code to join.");
    return;
  }

  setBusy(true);
  state.isHost = false;
  state.roomId = code;
  setRoomCodeDisplay(code);
  setChatStatus("Joining room...");

  ensureSocket();

  try {
    await prepareLocalMedia(state.callType);
  } catch (err) {
    setBusy(false);
    return;
  }

  socket.emit("join-room", {
    roomId: state.roomId,
    name: state.name,
    callType: state.callType
  });
}

function endCall() {
  if (socket && state.roomId) {
    socket.emit("leave-room");
  }

  if (state.pc) {
    state.pc.ontrack = null;
    state.pc.onicecandidate = null;
    state.pc.close();
  }

  if (state.localStream) {
    state.localStream.getTracks().forEach((track) => track.stop());
  }

  state.pc = null;
  state.localStream = null;
  state.mediaPromise = null;
  state.inCall = false;
  state.isBusy = false;
  state.roomId = "";
  state.isHost = false;
  state.micEnabled = true;
  state.camEnabled = true;

  elements.localVideo.srcObject = null;
  clearRemoteVideo();
  setRoomCodeDisplay("-");
  setChatStatus("Waiting for call");
  const online = socket && socket.connected;
  setConnectionStatus(online ? "Online" : "Offline", online ? "online" : null);
  setInCallUI(false);
  updateNameState();
}

function toggleMic() {
  if (!state.localStream) return;
  const tracks = state.localStream.getAudioTracks();
  if (!tracks.length) return;
  state.micEnabled = !state.micEnabled;
  tracks.forEach((track) => {
    track.enabled = state.micEnabled;
  });
  updateTrackButtons();
}

function toggleCam() {
  if (!state.localStream) return;
  const tracks = state.localStream.getVideoTracks();
  if (!tracks.length) return;
  state.camEnabled = !state.camEnabled;
  tracks.forEach((track) => {
    track.enabled = state.camEnabled;
  });
  updateTrackButtons();
}

function sendTextMessage() {
  if (!state.inCall) return;
  const message = elements.chatText.value.trim();
  if (!message) return;
  addMessage({ name: "You", text: message, from: "me" });
  elements.chatText.value = "";
  socket.emit("chat-message", {
    roomId: state.roomId,
    message,
    name: state.name,
    ts: Date.now()
  });
}

function sendImageMessage(file) {
  if (!file || !state.inCall) return;
  if (file.size > 2 * 1024 * 1024) {
    addSystemMessage("Image is too large. Max size is 2MB.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    addMessage({ name: "You", image: dataUrl, from: "me" });
    socket.emit("chat-image", {
      roomId: state.roomId,
      dataUrl,
      name: state.name,
      ts: Date.now(),
      size: file.size
    });
  };
  reader.readAsDataURL(file);
}

elements.displayName.addEventListener("input", updateNameState);
elements.roomCode.addEventListener("input", () => {
  elements.roomCode.value = elements.roomCode.value.toUpperCase();
});

elements.typeVideo.addEventListener("click", () => setCallType("video"));
elements.typeVoice.addEventListener("click", () => setCallType("voice"));

elements.startVideo.addEventListener("click", () => startCall("video"));
elements.startVoice.addEventListener("click", () => startCall("voice"));
elements.joinCall.addEventListener("click", joinCall);

elements.toggleMic.addEventListener("click", toggleMic);
elements.toggleCam.addEventListener("click", toggleCam);
elements.endCall.addEventListener("click", endCall);

elements.sendMessage.addEventListener("click", sendTextMessage);
elements.chatText.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    sendTextMessage();
  }
});

elements.attachImage.addEventListener("click", () => {
  elements.chatImage.click();
});

elements.chatImage.addEventListener("change", (event) => {
  const [file] = event.target.files || [];
  if (file) sendImageMessage(file);
  elements.chatImage.value = "";
});

elements.copyCode.addEventListener("click", async () => {
  const code = elements.roomCodeDisplay.textContent.trim();
  if (!code || code === "-") return;
  try {
    await navigator.clipboard.writeText(code);
    addSystemMessage("Room code copied to clipboard.");
  } catch (err) {
    addSystemMessage("Copy failed. Please copy the code manually.");
  }
});

updateNameState();
setCallType("video");
setInCallUI(false);
setConnectionStatus("Offline");
setChatStatus("Waiting for call");
