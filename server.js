const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const cors = require("cors");

const app = express();

// Enhanced CORS configuration
app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://studyhall-help.netlify.app"
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.options("*", cors()); // Handle preflight requests
app.use(express.json());

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

bot.login(process.env.BOT_TOKEN);

const webMessages = new Map();

// Improved message merging with error handling
const mergeMessages = (discordMessages, webMessages, channelId) => {
  try {
    const discordArray = Array.from(discordMessages.values());
    
    const formattedDiscord = discordArray.map(msg => ({
      username: msg.author?.username || 'Unknown',
      content: msg.content,
      avatar: msg.author?.displayAvatarURL() || '',
      timestamp: msg.createdTimestamp || Date.now()
    }));

    const formattedWeb = webMessages.get(channelId) || [];
    
    return [...formattedWeb, ...formattedDiscord].sort(
      (a, b) => b.timestamp - a.timestamp
    );
  } catch (error) {
    console.error('Message merging error:', error);
    return [];
  }
};

app.get("/messages/:channelId", async (req, res) => {
  try {
    const channel = await bot.channels.fetch(req.params.channelId);
    const messages = await channel.messages.fetch({ limit: 20 });
    res.json(mergeMessages(messages, webMessages, req.params.channelId));
  } catch (error) {
    console.error('GET /messages error:', error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

app.post("/send", async (req, res) => {
  try {
    const { channelId, content, username } = req.body;
    
    if (!channelId || !content || !username) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!webMessages.has(channelId)) {
      webMessages.set(channelId, []);
    }
    
    webMessages.get(channelId).push({
      username,
      content,
      timestamp: Date.now(),
      avatar: "https://cdn.discordapp.com/embed/avatars/0.png"
    });

    const channel = await bot.channels.fetch(channelId);
    await channel.send(`**${username}**: ${content}`);
    
    res.json({ success: true });
  } catch (error) {
    console.error('POST /send error:', error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

app.get("/health", (req, res) => res.sendStatus(200));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
