const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const cors = require("cors");

const app = express();

// ========== CORS CONFIGURATION ========== //
const allowedOrigins = ["https://studyhall-help.netlify.app"];

const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  allowedHeaders: "Content-Type,Authorization",
  credentials: true,
  optionsSuccessStatus: 204
};

// Apply CORS middleware first
app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // Handle all OPTIONS requests

// Manual header injection for security
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://studyhall-help.netlify.app");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  next();
});

// ========== DISCORD BOT SETUP ========== //
const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.MessageHistory
  ],
  presence: {
    status: "online",
    activities: [{
      name: "StudyHall Chat",
      type: "WATCHING"
    }]
  }
});

// Bot connection handlers
bot.on("ready", () => {
  console.log(`✅ Bot connected as ${bot.user.tag}`);
  console.log(`🌍 Serving ${bot.guilds.cache.size} servers`);
});

bot.on("error", error => {
  console.error("🔴 Discord client error:", error);
  process.exit(1); // Restart on critical errors
});

// Login with validation
const startBot = async () => {
  try {
    await bot.login(process.env.BOT_TOKEN);
    console.log("🔑 Bot authentication successful");
  } catch (error) {
    console.error("🔴 Bot login failed:", error);
    process.exit(1);
  }
};

// ========== APPLICATION LOGIC ========== //
app.use(express.json());

// Message storage with validation
const messageStore = new Map();
const MESSAGE_TTL = 3600000; // 1 hour

const validateChannel = async (channelId) => {
  const channel = await bot.channels.fetch(channelId);
  if (!channel) throw new Error("Channel not found");
  if (!channel.isTextBased()) throw new Error("Invalid channel type");
  return channel;
};

// API Endpoints
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    botStatus: bot.isReady() ? "online" : "offline",
    guildCount: bot.guilds.cache.size
  });
});

app.get("/messages/:channelId", async (req, res) => {
  try {
    const channel = await validateChannel(req.params.channelId);
    const discordMessages = await channel.messages.fetch({ limit: 50 });
    
    // Clean old messages
    const now = Date.now();
    const webMessages = (messageStore.get(req.params.channelId) || [])
      .filter(msg => now - msg.timestamp < MESSAGE_TTL);
    
    messageStore.set(req.params.channelId, webMessages);

    // Format response
    const formattedMessages = [
      ...webMessages,
      ...Array.from(discordMessages.values()).map(msg => ({
        id: msg.id,
        username: msg.author.username,
        content: msg.content,
        avatar: msg.author.displayAvatarURL({ size: 256 }),
        timestamp: msg.createdTimestamp,
        source: "discord"
      }))
    ].sort((a, b) => b.timestamp - a.timestamp);

    res.json(formattedMessages);
  } catch (error) {
    console.error("GET Error:", error.message);
    res.status(500).json({
      error: "Failed to load messages",
      details: error.message
    });
  }
});

app.post("/send", async (req, res) => {
  try {
    const { channelId, content, username } = req.body;
    
    // Validation
    if (!channelId || !content?.trim() || !username?.trim()) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const channel = await validateChannel(channelId);
    
    // Store message
    if (!messageStore.has(channelId)) {
      messageStore.set(channelId, []);
    }
    
    messageStore.get(channelId).push({
      username: username.trim(),
      content: content.trim(),
      timestamp: Date.now(),
      avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
      source: "web"
    });

    // Send to Discord
    await channel.send(`**${username}**: ${content}`);
    
    res.json({ success: true });
  } catch (error) {
    console.error("POST Error:", error.message);
    res.status(500).json({
      error: "Message failed to send",
      details: error.message
    });
  }
});

// ========== SERVER START ========== //
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  startBot();
});
