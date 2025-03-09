const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const cors = require('cors');

const app = express();
app.use(cors({ origin: 'https://studyhall-help.netlify.app' }));
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
const webMessages = new Map();

app.get('/messages/:channelId', async (req, res) => {
  try {
    const channel = await bot.channels.fetch(req.params.channelId);
    const discordMessages = await channel.messages.fetch({ limit: 50 });
    
    const formattedDiscord = Array.from(discordMessages.values()).map(msg => ({
      username: msg.author.username,
      content: msg.content,
      avatar: msg.author.displayAvatarURL()
    }));

    const webMessagesForChannel = webMessages.get(req.params.channelId) || [];
    
    res.json([
      ...webMessagesForChannel,
      ...formattedDiscord
    ].sort((a, b) => b.createdTimestamp - a.timestamp));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/send', async (req, res) => {
  try {
    const { channelId, content, username } = req.body;
    
    if (!channelId || !content || !username) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const channel = await bot.channels.fetch(channelId);
    await channel.send(`**${username}**: ${content}`);
    
    if (!webMessages.has(channelId)) webMessages.set(channelId, []);
    webMessages.get(channelId).push({
      username,
      content,
      timestamp: Date.now(),
      avatar: "https://cdn.discordapp.com/embed/avatars/0.png"
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
