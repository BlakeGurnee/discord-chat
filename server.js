const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const cors = require('cors');

const app = express();
app.use(cors());

// WORKING INTENTS CONFIG
const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ] // Removed problematic intent
});

bot.login(process.env.BOT_TOKEN)
  .then(() => console.log('Bot connected!'))
  .catch(console.error);

app.get('/messages/:channelId', async (req, res) => {
  try {
    const channel = await bot.channels.fetch(req.params.channelId);
    const messages = await channel.messages.fetch({ limit: 20 });
    res.json(messages.map(m => ({
      username: m.author.username,
      content: m.content,
      avatar: m.author.displayAvatarURL()
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => console.log('Server ready'));
