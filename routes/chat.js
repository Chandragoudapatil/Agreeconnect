const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const User = require('../models/User');
const { isLoggedIn } = require('../middleware/auth');

// List All Chats for Current User
router.get('/', isLoggedIn, async (req, res) => {
    try {
        const userId = req.session.user._id;
        // Find chats where user is a participant
        const chats = await Chat.find({ participants: userId })
            .populate('participants', 'name role') // Populate names
            .sort({ lastUpdated: -1 });

        res.render('chat-list', { user: req.session.user, chats });
    } catch (err) {
        console.error(err);
        res.redirect('/?msg=Error+Loading+Chats');
    }
});

// Start a New Chat (or get existing)
router.get('/start/:targetUserId', isLoggedIn, async (req, res) => {
    try {
        const myId = req.session.user._id;
        const targetId = req.params.targetUserId;

        // Check if chat exists
        let chat = await Chat.findOne({
            participants: { $all: [myId, targetId] }
        });

        if (!chat) {
            chat = await Chat.create({
                participants: [myId, targetId],
                messages: []
            });
        }

        res.redirect(`/chat/${chat._id}`);
    } catch (err) {
        console.error(err);
        res.redirect('/chat?msg=Error+Starting+Chat');
    }
});

// View Specific Chat Room
router.get('/:chatId', isLoggedIn, async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.chatId)
            .populate('participants', 'name role')
            .populate('messages.sender', 'name'); // Populate sender names

        if (!chat) return res.redirect('/chat');

        // Identify the "other" person for the header
        const otherParticipant = chat.participants.find(p => p._id.toString() !== req.session.user._id);

        res.render('chat-room', {
            user: req.session.user,
            chat,
            otherUser: otherParticipant
        });
    } catch (err) {
        console.error(err);
        res.redirect('/chat');
    }
});

module.exports = router;
