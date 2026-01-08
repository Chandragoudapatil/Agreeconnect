require("dotenv").config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const db = require('./config/db');

const authRoutes = require('./routes/auth');
const farmerRoutes = require('./routes/farmer');
const buyerRoutes = require('./routes/buyer');
const adminRoutes = require('./routes/admin');
const cartRoutes = require('./routes/cart');
const chatRoutes = require('./routes/chat');
const { attachUser } = require('./middleware/auth');

// Connect to DB (uses MONGO_URI or defaults)
db.connect();

const app = express();
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session MUST be initialized before attachUser and before route-level auth
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
  })
);

// attachUser: safe helper that sets res.locals.user even if session is missing
app.use(attachUser);

// Mount routers
app.use('/auth', authRoutes);
app.use('/farmer', farmerRoutes);
app.use('/buyer', buyerRoutes);
app.use('/cart', cartRoutes);
app.use('/admin', adminRoutes);
app.use('/chat', chatRoutes);

// Handle old /login and /register routes (for backwards compatibility)
// This ensures both /login and /auth/login work
app.get('/login', (req, res) => res.redirect('/auth/login'));
app.get('/register', (req, res) => res.redirect('/auth/register'));
app.post('/login', (req, res, next) => {
  // Forward POST /login to the auth router
  req.url = '/login';
  req.originalUrl = '/login';
  authRoutes.handle(req, res, next);
});
app.post('/register', (req, res, next) => {
  // Forward POST /register to the auth router
  req.url = '/register';
  req.originalUrl = '/register';
  authRoutes.handle(req, res, next);
});

app.get('/', (req, res) => res.redirect('/auth/login'));

const http = require('http');
const socketIo = require('socket.io');

const server = http.createServer(app);
const io = socketIo(server);

// Make io available in routes
app.use((req, res, next) => {
  req.io = io;
  res.locals.currentUser = req.session.user || null; // Ensure user is available in views
  next();
});

const Chat = require('./models/Chat');

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log('New client connected: ' + socket.id);

  // Join a specific chat room
  socket.on('join_chat', (chatId) => {
    socket.join(chatId);
    console.log(`Socket ${socket.id} joined chat ${chatId}`);
  });

  // Handle new message
  socket.on('send_message', async ({ chatId, senderId, text }) => {
    try {
      // Save to DB
      const chat = await Chat.findById(chatId);
      if (chat) {
        const newMessage = { sender: senderId, text, timestamp: new Date() };
        chat.messages.push(newMessage);
        chat.lastUpdated = new Date();
        await chat.save();

        // Broadcast to everyone in the room (including sender)
        // We include senderId so client can style it (left/right)
        io.to(chatId).emit('receive_message', newMessage);
      }
    } catch (error) {
      console.error("Chat Error:", error);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server started on ${PORT}`));
