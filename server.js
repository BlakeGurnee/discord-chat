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

// In-memory user storage (for production, use a database)
const users = {};

// Endpoint to register a new user
app.post('/register', (req, res) => {
  try {
    const { username, password, profilePic } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (users[username]) {
      return res.status(400).json({ error: "Username already taken" });
    }
    // In production, always hash passwords!
    users[username] = { password, profilePic: profilePic || "https://cdn.discordapp.com/embed/avatars/1.png" };
    res.json({ success: true, message: "User registered successfully" });
  } catch (error) {
    console.error("Error in /register:", error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to fetch a user's profile
app.get('/user/:username', (req, res) => {
  try {
    const username = req.params.username;
    const user = users[username];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ username, profilePic: user.profilePic });
  } catch (error) {
    console.error("Error in /user:", error);
    res.status(500).json({ error: error.message });
  }
});

// Message storage (for web messages)
const messageStore = new Map();

// Fetch messages endpoint
app.get('/messages/:channelId', async (req, res) => {
  try {
    const channel = await bot.channels.fetch(req.params.channelId);
    const discordMessages = await channel.messages.fetch({ limit: 50 });
    
    // Format Discord messages (ignore bot messages)
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

    // Get web messages stored on the server
    const webMessages = messageStore.get(req.params.channelId) || [];
    
    // Combine and sort messages by timestamp
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

// Send message endpoint
app.post('/send', async (req, res) => {
  try {
    const { channelId, content, username } = req.body;
    
    if (!channelId || !content || !username) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    // Look up the user's profile to get their avatar
    let avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
    if (users[username] && users[username].profilePic) {
      avatarUrl = users[username].profilePic;
    }

    // Create the web message object
    const newMessage = {
      id: `web-${Date.now()}`,
      username,
      content,
      avatar: avatarUrl,
      timestamp: Date.now(),
      source: 'web'
    };

    if (!messageStore.has(channelId)) {
      messageStore.set(channelId, []);
    }
    messageStore.get(channelId).push(newMessage);

    // Send the message to Discord as well
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
