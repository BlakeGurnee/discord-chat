const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

// Set the strictQuery option to true if you want to suppress the warning
mongoose.set('strictQuery', true);


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

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch(err => {
    console.error("Error connecting to MongoDB:", err);
  });

// Define User Schema for MongoDB
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profilePic: { type: String, default: "https://cdn.discordapp.com/embed/avatars/1.png" },
  nickname: { type: String, default: "" }
});

const User = mongoose.model('User', userSchema);

// ** REGISTER a New User **
app.post('/register', async (req, res) => {
  try {
    const { username, password, profilePic } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: "Username already taken" });
    }

    const user = new User({
      username,
      password,
      profilePic: profilePic || "https://cdn.discordapp.com/embed/avatars/1.png"
    });

    await user.save(); // Save user to MongoDB
    res.json({ success: true, message: "User registered successfully" });
  } catch (error) {
    console.error("Error in /register:", error);
    res.status(500).json({ error: error.message });
  }
});

// ** LOGIN User **
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ error: "Account not found" });
    }

    if (user.password !== password) {
      return res.status(400).json({ error: "Incorrect password" });
    }

    res.json({
      username: user.username,
      profilePic: user.profilePic,
      nickname: user.nickname || user.username // Return the nickname or username if not set
    });

  } catch (error) {
    console.error("Error in /login:", error);
    res.status(500).json({ error: error.message });
  }
});

// ** GET User Profile **
app.get('/user/:username', async (req, res) => {
  try {
    const username = req.params.username;
    const user = await User.findOne({ username });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

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
app.put('/user', async (req, res) => {
  try {
    const { currentUsername, newUsername, newPassword, newProfilePic, newNickname } = req.body;

    const user = await User.findOne({ username: currentUsername });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (newUsername && newUsername !== currentUsername) {
      const existingUser = await User.findOne({ username: newUsername });
      if (existingUser) {
        return res.status(400).json({ error: "Username already taken" });
      }
      user.username = newUsername;
    }

    if (newPassword) user.password = newPassword;
    if (newProfilePic) user.profilePic = newProfilePic;
    if (newNickname) user.nickname = newNickname;

    await user.save(); // Save the updated user to MongoDB

    res.json({
      success: true,
      username: user.username,
      profilePic: user.profilePic,
      nickname: user.nickname || user.username
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

    let avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
    let displayName = username;
    const user = await User.findOne({ username });

    if (user) {
      avatarUrl = user.profilePic;
      displayName = user.nickname || username;
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
