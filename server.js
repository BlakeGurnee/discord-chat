const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const cors = require('cors');

const app = express();

// CORS Configuration
app.use(cors({
  origin: 'https://studyhall-help.netlify.app',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Discord Client Configuration
const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageHistory
  ]
});

// Bot Connection Handlers
bot.on('ready', () => {
  console.log(`✅ Bot online as ${bot.user.tag}`);
  console.log(`🏫 Serving ${bot.guilds.cache.size} servers`);
});

bot.on('error', error => {
  console.error('🔴 Critical Discord error:', error);
  process.exit(1);
});

// Message Storage
const messageCache = new Map();
const CACHE_TTL = 3600000; // 1 hour

// API Endpoints
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    botStatus: bot.isReady() ? 'online' : 'offline',
    version: '1.0.0'
  });
});

app.get('/messages/:channelId', async (req, res) => {
  try {
    const channel = await bot.channels.fetch(req.params.channelId);
    const messages = await channel.messages.fetch({ limit: 50 });
    
    // Cache cleanup
    const now = Date.now();
    const cachedMessages = (messageCache.get(req.params.channelId) || [])
      .filter(msg => now - msg.timestamp < CACHE_TTL);
    
    messageCache.set(req.params.channelId, cachedMessages);

    res.json([
      ...cachedMessages,
      ...messages.map(msg => ({
        id: msg.id,
        username: msg.author.username,
        content: msg.content,
        avatar: msg.author.displayAvatarURL({ size: 256 }),
        timestamp: msg.createdTimestamp
      }))
    ].sort((a, b) => b.timestamp - a.timestamp));
  } catch (error) {
    console.error('GET Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/send', async (req, res) => {
  try {
    const { channelId, content, username } = req.body;
    
    // Validation
    if (!channelId || !content?.trim() || !username?.trim()) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const channel = await bot.channels.fetch(channelId);
    
    // Store message
    if (!messageCache.has(channelId)) {
      messageCache.set(channelId, []);
    }
    
    messageCache.get(channelId).push({
      username: username.trim(),
      content: content.trim(),
      timestamp: Date.now(),
      avatar: 'https://cdn.discordapp.com/embed/avatars/0.png'
    });

    // Send to Discord
    await channel.send(`**${username}**: ${content}`);
    
    res.json({ success: true });
  } catch (error) {
    console.error('POST Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Server Startup
const PORT = process.env.PORT || 3000;

bot.login(process.env.BOT_TOKEN)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch(error => {
    console.error('🔴 Bot login failed:', error);
    process.exit(1);
  });
