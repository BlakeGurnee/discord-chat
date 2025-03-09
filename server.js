const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*' })); // Temporarily allow all origins for debugging
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
    console.log(`Fetching messages for channel ${req.params.channelId}`);
    
    const channel = await bot.channels.fetch(req.params.channelId);
    const discordMessages = await channel.messages.fetch({ limit: 50 });
    
    const formattedDiscord = Array.from(discordMessages.values())
      .filter(msg => !msg.author.bot)
      .map(msg => ({
        username: msg.author.username,
        content: msg.content,
        avatar: msg.author.displayAvatarURL(),
        origin: 'discord',
        timestamp: msg.createdTimestamp
      }));

    const webMessagesForChannel = webMessages.get(req.params.channelId) || [];
    
    const allMessages = [
      ...webMessagesForChannel,
      ...formattedDiscord
    ].sort((a, b) => b.timestamp - a.timestamp);

    console.log(`Returning ${allMessages.length} messages`);
    res.json(allMessages);
    
  } catch (error) {
    console.error("Error in /messages:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/send', async (req, res) => {
  try {
    console.log("Received message:", req.body);
    const { channelId, content, username } = req.body;
    
    if (!channelId || !content || !username) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Store web message
    if (!webMessages.has(channelId)) webMessages.set(channelId, []);
    webMessages.get(channelId).push({
      username,
      content,
      origin: 'web',
      timestamp: Date.now(),
      avatar: "https://cdn.discordapp.com/embed/avatars/0.png"
    });

    // Send to Discord
    const channel = await bot.channels.fetch(channelId);
    await channel.send(`**${username}**: ${content}`);
    
    res.json({ success: true });
    
  } catch (error) {
    console.error("Error in /send:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
