const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const cors = require("cors");

const app = express();

// CORS Configuration
const corsOptions = {
  origin: "https://studyhall-help.netlify.app",
  methods: "GET,HEAD,POST,OPTIONS",
  allowedHeaders: "Content-Type,Authorization",
  credentials: true,
  optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // Preflight handling
app.use(express.json());

// Discord Client
const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

bot.login(process.env.BOT_TOKEN);

// Message Storage
const webMessages = new Map();

// Message Processing
const processMessages = (discordMessages, channelId) => {
  const discordArray = Array.from(discordMessages.values());
  const formattedDiscord = discordArray.map(msg => ({
    username: msg.author?.username || 'Anonymous',
    content: msg.content,
    avatar: msg.author?.displayAvatarURL({ format: 'png', size: 256 }) || '',
    timestamp: msg.createdTimestamp
  }));
  
  return [
    ...(webMessages.get(channelId) || []),
    ...formattedDiscord
  ].sort((a, b) => b.timestamp - a.timestamp);
};

// API Endpoints
app.get("/messages/:channelId", async (req, res) => {
  try {
    const channel = await bot.channels.fetch(req.params.channelId);
    const messages = await channel.messages.fetch({ limit: 50 });
    res.json(processMessages(messages, req.params.channelId));
  } catch (error) {
    console.error('GET Error:', error);
    res.status(500).json({ error: "Failed to load messages" });
  }
});

app.post("/send", async (req, res) => {
  try {
    const { channelId, content, username } = req.body;
    
    // Validate input
    if (![channelId, content, username].every(Boolean)) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Store web message
    if (!webMessages.has(channelId)) {
      webMessages.set(channelId, []);
    }
    webMessages.get(channelId).push({
      username,
      content,
      timestamp: Date.now(),
      avatar: "https://cdn.discordapp.com/embed/avatars/0.png"
    });

    // Send to Discord
    const channel = await bot.channels.fetch(channelId);
    await channel.send(`${username}: ${content}`);
    
    res.json({ success: true });
  } catch (error) {
    console.error('POST Error:', error);
    res.status(500).json({ error: "Message failed to send" });
  }
});

// Health Check
app.get("/health", (req, res) => res.sendStatus(200));

// Server Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
