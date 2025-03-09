const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

bot.login(process.env.BOT_TOKEN);

// Message storage
const messageStore = new Map();

// Fetch messages
app.get('/messages/:channelId', async (req, res) => {
  try {
    const channel = await bot.channels.fetch(req.params.channelId);
    const discordMessages = await channel.messages.fetch({ limit: 50 });
    
    // Filter out bot messages and transform
    const formattedDiscord = Array.from(discordMessages.values())
      .filter(msg => !msg.author.bot)
      .map(msg => ({
        id: msg.id,
        username: msg.author.username,
        content: msg.content,
        avatar: msg.author.displayAvatarURL(),
        timestamp: msg.createdTimestamp,
        source: 'discord'
      }));

    // Get web messages
    const webMessages = messageStore.get(req.params.channelId) || [];
    
    // Combine and sort messages
    const allMessages = [
      ...webMessages,
      ...formattedDiscord
    ].sort((a, b) => a.timestamp - b.timestamp);

    res.json(allMessages);
    
  } catch (error) {
    console.error("Error in /messages:", error);
    res.status(500).json({ error: error.message });
  }
});

// Send a message
app.post('/send', async (req, res) => {
  try {
    const { channelId, content, username } = req.body;
    
    if (!channelId || !content || !username) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Store web message
    const newMessage = {
      id: `web-${Date.now()}`,
      username,
      content,
      avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
      timestamp: Date.now(),
      source: 'web'
    };

    if (!messageStore.has(channelId)) {
      messageStore.set(channelId, []);
    }
    messageStore.get(channelId).push(newMessage);

    // Send to Discord
    const channel = await bot.channels.fetch(channelId);
    await channel.send(`${username}: ${content}`);
    
    res.json({ success: true });
    
  } catch (error) {
    console.error("Error in /send:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
