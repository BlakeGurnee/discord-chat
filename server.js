const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const cors = require("cors");

const app = express();

// Improved CORS configuration
app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://studyhall-help.netlify.app"  // Removed trailing slash and path
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

// Handle preflight requests
app.options("*", cors());

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

const mergeMessages = (discordMessages, webMessages, channelId) => {
  const formattedDiscord = discordMessages.map(msg => ({
    username: msg.author.username,
    content: msg.content,
    avatar: msg.author.displayAvatarURL(),
    timestamp: msg.createdTimestamp
  }));

  const formattedWeb = webMessages.has(channelId) 
    ? webMessages.get(channelId)
    : [];

  return [...formattedDiscord, ...formattedWeb].sort(
    (a, b) => b.timestamp - a.timestamp
  );
};

app.get("/messages/:channelId", async (req, res) => {
  try {
    const channel = await bot.channels.fetch(req.params.channelId);
    const discordMessages = await channel.messages.fetch({ limit: 20 });
    res.json(mergeMessages(discordMessages, webMessages, req.params.channelId));
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
});

app.get("/health", (req, res) => res.sendStatus(200));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
