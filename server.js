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
    GatewayIntentBits.MessageContent
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
      nickname: ""  // Nickname starts empty
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
      nickname: users[username].nickname || username // Return the nickname or username if not set
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

    // Show nickname if set, otherwise use username
    res.json({ 
      username: user.nickname || username, 
      profilePic: user.profilePic, 
      nickname: user.nickname || username // Return nickname if set, else username
    });

  } catch (error) {
    console.error("Error in /user:", error);
    res.status(500).json({ error: error.message });
  }
});

// ** UPDATE User Profile (username, password, profilePic, nickname) **
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
      nickname: users[updatedUsername].nickname || updatedUsername // Return nickname if set, else use updated username
    });

  } catch (error) {
    console.error("Error in /user update:", error);
    res.status(500).json({ error: error.message });
  }
});

// ** Message Storage for Web Messages **
const messageStore = new Map();

// ** FETCH Messages **
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

// ** SEND Message **
app.post('/send', async (req, res) => {
  try {
    const { channelId, content, username } = req.body;

    if (!channelId || !content || !username) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Look up the user's profile to get the correct avatar and nickname
    let avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
    let displayName = username;  // Default to username
    if (users[username] && users[username].profilePic) {
      avatarUrl = users[username].profilePic;
    }
    if (users[username] && users[username].nickname) {
      displayName = users[username].nickname;  // Use nickname if set
    }

    const newMessage = {
      id: `web-${Date.now()}`,
      username: displayName,
      content,
      avatar: avatarUrl,
      timestamp: Date.now(),
      source: 'web'
    };

    if (!messageStore.has(channelId)) {
      messageStore.set(channelId, []);
    }
    messageStore.get(channelId).push(newMessage);

    const channel = await bot.channels.fetch(channelId);
    await channel.send(`${displayName}: ${content}`);

    res.json({ success: true });
  } catch (error) {
    console.error("Error in /send:", error);
    res.status(500).json({ error: error.message });
  }
});

// ** Start Server **
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
