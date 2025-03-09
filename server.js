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

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ========== DISCORD BOT SETUP ========== //
const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageHistory // Corrected intent name
  ]
});

// Bot connection handlers
bot.on("ready", () => {
  console.log(`✅ Bot online as ${bot.user.tag}`);
  console.log(`🌍 Serving ${bot.guilds.cache.size} servers`);
});

bot.on("error", error => {
  console.error("🔴 Discord client error:", error);
  process.exit(1);
});

// ========== APPLICATION LOGIC ========== //
app.use(express.json());

// Message storage
const messageStore = new Map();
const MESSAGE_TTL = 3600000; // 1 hour

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    botStatus: bot.isReady() ? "online" : "offline"
  });
});

app.get("/messages/:channelId", async (req, res) => {
  try {
    const channel = await bot.channels.fetch(req.params.channelId);
    const messages = await channel.messages.fetch({ limit: 50 });
    
    // Clean old messages
    const now = Date.now();
    const webMessages = (messageStore.get(req.params.channelId) || [])
      .filter(msg => now - msg.timestamp < MESSAGE_TTL);
    
    messageStore.set(req.params.channelId, webMessages);

    res.json([
      ...webMessages,
      ...Array.from(messages.values()).map(msg => ({
        username: msg.author.username,
        content: msg.content,
        avatar: msg.author.displayAvatarURL(),
        timestamp: msg.createdTimestamp
      }))
    ].sort((a, b) => b.timestamp - a.timestamp));
  } catch (error) {
    console.error("GET Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/send", async (req, res) => {
  try {
    const { channelId, content, username } = req.body;
    
    if (!channelId || !content?.trim() || !username?.trim()) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const channel = await bot.channels.fetch(channelId);
    
    // Store message
    if (!messageStore.has(channelId)) {
      messageStore.set(channelId, []);
    }
    
    messageStore.get(channelId).push({
      username: username.trim(),
      content: content.trim(),
      timestamp: Date.now(),
      avatar: "https://cdn.discordapp.com/embed/avatars/0.png"
    });

    // Send to Discord
    await channel.send(`**${username}**: ${content}`);
    
    res.json({ success: true });
  } catch (error) {
    console.error("POST Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ========== SERVER START ========== //
const PORT = process.env.PORT || 3000;

bot.login(process.env.BOT_TOKEN)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch(error => {
    console.error("🔴 Bot login failed:", error);
    process.exit(1);
  });
