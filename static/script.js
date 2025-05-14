document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const chatsList = document.getElementById('chats-list');
    const activeChat = document.getElementById('active-chat');
    const messagesContainer = document.getElementById('messages-container');
    const messageForm = document.getElementById('message-form');
    const messageInput = document.getElementById('message-input');
    const contactsSidebar = document.getElementById('contacts-sidebar');
    const contactsList = document.getElementById('contacts-list');
    const closeContactsBtn = document.getElementById('close-contacts-btn');
    const contactName = document.getElementById('contact-name');
    const contactPhone = document.getElementById('contact-phone');
    
    // State variables
    let currentChatId = null;
    let currentContactId = null;
    let currentContactName = null;
    let currentContactPhone = null;
    
    // Initialize the app
    init();
    
    function init() {
        loadChats();
        loadContacts();
        
        // Set up event listeners
        messageForm.addEventListener('submit', handleMessageSubmit);
        closeContactsBtn.addEventListener('click', closeContactsSidebar);
        
        // Poll for new messages every 2 seconds
        setInterval(pollMessages, 2000);
    }
    
    function loadChats() {
        fetch('/api/chats')
            .then(response => response.json())
            .then(chats => {
                chatsList.innerHTML = '';
                
                if (chats.length === 0) {
                    chatsList.innerHTML = `
                        <div class="no-chats">
                            <p>No chats yet. Start a new conversation!</p>
                            <button id="new-chat-btn">New Chat</button>
                        </div>
                    `;
                    
                    document.getElementById('new-chat-btn').addEventListener('click', openContactsSidebar);
                    return;
                }
                
                chats.forEach(chat => {
                    const chatItem = document.createElement('div');
                    chatItem.className = 'chat-item';
                    chatItem.dataset.chatId = chat.id;
                    chatItem.dataset.contactId = chat.contact_id;
                    chatItem.dataset.contactName = chat.contact_name;
                    chatItem.dataset.contactPhone = chat.contact_phone;
                    
                    chatItem.innerHTML = `
                        <div class="chat-item-avatar">${chat.contact_name.charAt(0)}</div>
                        <div class="chat-item-info">
                            <div class="chat-item-name">${chat.contact_name}</div>
                            <div class="chat-item-last-message">${chat.last_message || 'No messages yet'}</div>
                        </div>
                        <div class="chat-item-time">${formatTime(chat.last_message_time)}</div>
                    `;
                    
                    chatItem.addEventListener('click', () => {
                        openChat(chat.id, chat.contact_id, chat.contact_name, chat.contact_phone);
                    });
                    
                    chatsList.appendChild(chatItem);
                });
                
                // Add new chat button
                const newChatItem = document.createElement('div');
                newChatItem.className = 'chat-item new-chat';
                newChatItem.innerHTML = `
                    <div class="chat-item-avatar">+</div>
                    <div class="chat-item-info">
                        <div class="chat-item-name">New Chat</div>
                    </div>
                `;
                
                newChatItem.addEventListener('click', openContactsSidebar);
                chatsList.appendChild(newChatItem);
            })
            .catch(error => {
                console.error('Error loading chats:', error);
            });
    }
    
    function loadContacts() {
        fetch('/api/contacts')
            .then(response => response.json())
            .then(contacts => {
                contactsList.innerHTML = '';
                
                if (contacts.length === 0) {
                    contactsList.innerHTML = '<p>No contacts available</p>';
                    return;
                }
                
                contacts.forEach(contact => {
                    const contactItem = document.createElement('div');
                    contactItem.className = 'contact-item';
                    contactItem.dataset.contactId = contact.id;
                    contactItem.dataset.contactName = contact.name;
                    contactItem.dataset.contactPhone = contact.phone;
                    
                    contactItem.innerHTML = `
                        <div class="contact-item-avatar">${contact.name.charAt(0)}</div>
                        <div class="contact-item-name">${contact.name}</div>
                    `;
                    
                    contactItem.addEventListener('click', () => {
                        startNewChat(contact.id, contact.name, contact.phone);
                    });
                    
                    contactsList.appendChild(contactItem);
                });
            })
            .catch(error => {
                console.error('Error loading contacts:', error);
            });
    }
    
    function openChat(chatId, contactId, name, phone) {
        currentChatId = chatId;
        currentContactId = contactId;
        currentContactName = name;
        currentContactPhone = phone;
        
        // Update UI
        document.querySelector('.empty-chat').style.display = 'none';
        activeChat.style.display = 'flex';
        contactName.textContent = name;
        contactPhone.textContent = phone;
        
        // Load messages
        loadMessages(chatId);
        
        // Highlight active chat
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.chatId === chatId.toString()) {
                item.classList.add('active');
            }
        });
    }
    
    function startNewChat(contactId, name, phone) {
        fetch(`/api/chat/${contactId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: '' })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error('Error creating chat:', data.error);
                return;
            }
            
            closeContactsSidebar();
            loadChats(); // Refresh chats list
            
            // Find the new chat and open it
            setTimeout(() => {
                const newChatItem = document.querySelector(`.chat-item[data-contact-id="${contactId}"]`);
                if (newChatItem) {
                    newChatItem.click();
                }
            }, 300);
        })
        .catch(error => {
            console.error('Error creating chat:', error);
        });
    }
    
    function loadMessages(chatId) {
        fetch(`/api/chat/${currentContactId}`)
            .then(response => response.json())
            .then(messages => {
                messagesContainer.innerHTML = '';
                
                messages.forEach(message => {
                    addMessageToDOM(message);
                });
                
                scrollToBottom();
            })
            .catch(error => {
                console.error('Error loading messages:', error);
            });
    }
    
    function pollMessages() {
        if (!currentChatId) return;
        
        fetch(`/api/chat/${currentContactId}`)
            .then(response => response.json())
            .then(messages => {
                const currentMessageIds = Array.from(messagesContainer.children).map(el => el.dataset.messageId);
                const newMessages = messages.filter(msg => !currentMessageIds.includes(msg.id.toString()));
                
                newMessages.forEach(message => {
                    addMessageToDOM(message);
                });
                
                if (newMessages.length > 0) {
                    scrollToBottom();
                }
            })
            .catch(error => {
                console.error('Error polling messages:', error);
            });
    }
    
    function addMessageToDOM(message) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.sender_name === currentContactName ? 'received' : 'sent'}`;
        messageElement.dataset.messageId = message.id;
        
        messageElement.innerHTML = `
            <div class="message-text">${message.message}</div>
            <div class="message-time">${formatTime(message.created_at)}</div>
        `;
        
        messagesContainer.appendChild(messageElement);
    }
    
    function handleMessageSubmit(e) {
        e.preventDefault();
        
        if (!messageInput.value.trim() || !currentContactId) return;
        
        fetch(`/api/chat/${currentContactId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: messageInput.value })
        })
        .then(response => response.json())
        .then(message => {
            addMessageToDOM(message);
            messageInput.value = '';
            scrollToBottom();
            loadChats(); // Refresh chats list to update last message
        })
        .catch(error => {
            console.error('Error sending message:', error);
        });
    }
    
    function openContactsSidebar() {
        contactsSidebar.style.display = 'flex';
    }
    
    function closeContactsSidebar() {
        contactsSidebar.style.display = 'none';
    }
    
    function scrollToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    function formatTime(timestamp) {
        if (!timestamp) return '';
        
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
});