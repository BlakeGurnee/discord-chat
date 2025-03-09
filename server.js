const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors({ origin: '*' }));

// Increase request body size limit to 10MB
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.Attachments
  ]
});

bot.login(process.env.BOT_TOKEN);

// In-memory user storage (use a real database for production)
const users = {};

// ** REGISTER a New User **
app.post('/register', (req, res) => {
  try {
    const { username, password, profilePic } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (users[username]) {
      return res.status(400).json({ error: "Username already taken" });
    }

    // Store the user (hash passwords in production!)
    users[username] = { 
      password, 
      profilePic: profilePic || "https://cdn.discordapp.com/embed/avatars/1.png",
      nickname: ""
    };

    res.json({ success: true, message: "User registered successfully" });
  } catch (error) {
    console.error("Error in /register:", error);
    res.status(500).json({ error: error.message });
  }
});

// ** LOGIN User **
app.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!users[username]) {
      return res.status(400).json({ error: "Account not found" });
    }

    if (users[username].password !== password) {
      return res.status(400).json({ error: "Incorrect password" });
    }

    res.json({ 
      username, 
      profilePic: users[username].profilePic, 
      nickname: users[username].nickname 
    });

  } catch (error) {
    console.error("Error in /login:", error);
    res.status(500).json({ error: error.message });
  }
});

// ** GET User Profile **
app.get('/user/:username', (req, res) => {
  try {
    const username = req.params.username;
    const user = users[username];

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ username, profilePic: user.profilePic, nickname: user.nickname });

  } catch (error) {
    console.error("Error in /user:", error);
    res.status(500).json({ error: error.message });
  }
});

// ** UPDATE User Profile **
app.put('/user', (req, res) => {
  try {
    const { currentUsername, newUsername, newPassword, newProfilePic, newNickname } = req.body;

    if (!users[currentUsername]) {
      return res.status(404).json({ error: "User not found" });
    }

    let updatedUsername = currentUsername;

    if (newUsername && newUsername !== currentUsername) {
      if (users[newUsername]) {
        return res.status(400).json({ error: "Username already taken" });
      }
      // Move user data to new key
      users[newUsername] = { ...users[currentUsername] };
      delete users[currentUsername];
      updatedUsername = newUsername;
    }

    if (newPassword) {
      users[updatedUsername].password = newPassword;
    }

    if (newProfilePic) {
      users[updatedUsername].profilePic = newProfilePic;
    }

    if (newNickname) {
      users[updatedUsername].nickname = newNickname;
    }

    res.json({ 
      success: true, 
      username: updatedUsername, 
      profilePic: users[updatedUsername].profilePic, 
      nickname: users[updatedUsername].nickname 
    });

  } catch (error) {
    console.error("Error in /user update:", error);
    res.status(500).json({ error: error.message });
  }
});

// ** Message Storage for Web Messages **
const messageStore = new Map();

// ** Fetch Messages **
app.get('/messages/:channelId', async (req, res) => {
  try {
    const channel = await bot.channels.fetch(req.params.channelId);
    const discordMessages = await channel.messages.fetch({ limit: 50 });

    // Format Discord messages (ignoring bot messages)
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

    const webMessages = messageStore.get(req.params.channelId) || [];
    const allMessages = [...webMessages, ...formattedDiscord].sort((a, b) => a.timestamp - b.timestamp);

    res.json(allMessages);
  } catch (error) {
    console.error("Error in /messages:", error);
    res.status(500).json({ error: error.message });
  }
});

// ** Send Message **
app.post('/send', async (req, res) => {
  try {
    const { channelId, content, username, attachments } = req.body;

    if (!channelId || !content || !username) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Identify the image channel ID (replace with your actual channel ID)
    const imageChannelId = '1348421097372123239';

    // Check if the message is being sent to the image channel
    if (channelId !== imageChannelId) {
      return res.status(403).json({ error: "Images can only be posted in the images channel" });
    }

    // If there are attachments, check if they are images
    if (attachments && attachments.length > 0) {
      const attachment = attachments[0]; // Assuming only one attachment is sent per request
      const isImage = attachment.url.match(/\.(jpg|jpeg|png|gif)$/i);
      if (!isImage) {
        return res.status(400).json({ error: "Only image files are allowed in this channel" });
      }
    }

    // Look up the user's profile to get the correct avatar
    let avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
    if (users[username] && users[username].profilePic) {
      avatarUrl = users[username].profilePic;
    }

    const newMessage = {
      id: `web-${Date.now()}`,
      username,
      content,
      avatar: avatarUrl,
      timestamp: Date.now(),
      source: 'web'
    };

    if (attachments && attachments.length > 0) {
      newMessage.attachment = attachments[0].url; // Add the image URL to the message
    }

    if (!messageStore.has(channelId)) {
      messageStore.set(channelId, []);
    }
    messageStore.get(channelId).push(newMessage);

    const channel = await bot.channels.fetch(channelId);
    await channel.send(`${username}: ${content}`);

    res.json({ success: true });
  } catch (error) {
    console.error("Error in /send:", error);
    res.status(500).json({ error: error.message });
  }
});

// ** Start Server **
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
