const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const cors = require("cors");

const app = express();

// Enhanced CORS Configuration
const corsOptions = {
  origin: "https://studyhall-help.netlify.app",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 200
};

// Apply CORS middleware first
app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // Handle all OPTIONS requests

// Add security headers middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://studyhall-help.netlify.app");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  next();
});

app.use(express.json());

// Discord Client with error handling
const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

bot.login(process.env.BOT_TOKEN)
  .then(() => console.log("Discord bot connected"))
  .catch(error => console.error("Discord login failed:", error));

// Message storage with TTL (1 hour)
const webMessages = new Map();
const MESSAGE_TTL = 3600000; // 1 hour

// Message processing with validation
const processMessages = (discordMessages, channelId) => {
  try {
    // Clean up old messages
    const now = Date.now();
    const webMessagesForChannel = (webMessages.get(channelId) || [])
      .filter(msg => now - msg.timestamp < MESSAGE_TTL);

    webMessages.set(channelId, webMessagesForChannel);

    // Process Discord messages
    const discordArray = Array.from(discordMessages.values());
    const formattedDiscord = discordArray.map(msg => ({
      username: msg.author?.username || 'System',
      content: msg.content,
      avatar: msg.author?.displayAvatarURL({ dynamic: true }) || '',
      timestamp: msg.createdTimestamp,
      source: 'discord'
    }));

    // Combine messages
    return [
      ...webMessagesForChannel,
      ...formattedDiscord
    ].sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error("Message processing error:", error);
    return [];
  }
};

// API Endpoints with improved error handling
app.get("/messages/:channelId", async (req, res) => {
  try {
    const channel = await bot.channels.fetch(req.params.channelId);
    if (!channel) {
      return res.status(404).json({ error: "Channel not found" });
    }

    const messages = await channel.messages.fetch({ limit: 50 });
    res.json(processMessages(messages, req.params.channelId));
  } catch (error) {
    console.error("GET /messages error:", error.message);
    res.status(500).json({ 
      error: "Failed to load messages",
      details: error.message
    });
  }
});

app.post("/send", async (req, res) => {
  try {
    const { channelId, content, username } = req.body;
    
    // Validate input
    const errors = [];
    if (!channelId) errors.push("Missing channel ID");
    if (!content?.trim()) errors.push("Message content required");
    if (!username?.trim()) errors.push("Username required");
    
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    // Store web message
    if (!webMessages.has(channelId)) {
      webMessages.set(channelId, []);
    }
    
    webMessages.get(channelId).push({
      username: username.trim(),
      content: content.trim(),
      timestamp: Date.now(),
      avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
      source: 'web'
    });

    // Send to Discord
    const channel = await bot.channels.fetch(channelId);
    await channel.send(`**${username}**: ${content}`);
    
    res.json({ success: true });
  } catch (error) {
    console.error("POST /send error:", error.message);
    res.status(500).json({ 
      error: "Message failed to send",
      details: error.message
    });
  }
});

// Health check with CORS headers
app.get("/health", (req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.send("OK");
});

// Server setup
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("CORS configured for:", corsOptions.origin);
});
