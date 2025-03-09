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
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageHistory
  ]
});

bot.login(process.env.BOT_TOKEN);

app.get('/messages/:channelId', async (req, res) => {
  try {
    const channel = await bot.channels.fetch(req.params.channelId);
    const messages = await channel.messages.fetch({ limit: 50 });
    
    const formattedMessages = Array.from(messages.values())
      .map(msg => ({
        id: msg.id,
        username: msg.author.bot ? 'Bot' : msg.author.username,
        content: msg.content,
        avatar: msg.author.displayAvatarURL(),
        timestamp: msg.createdTimestamp
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    res.json(formattedMessages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/send', async (req, res) => {
  try {
    const { channelId, content, username } = req.body;
    const channel = await bot.channels.fetch(channelId);
    const sentMessage = await channel.send(`**${username}**: ${content}`);
    
    res.json({
      success: true,
      message: {
        id: sentMessage.id,
        username: username,
        content: content,
        avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
        timestamp: Date.now()
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
