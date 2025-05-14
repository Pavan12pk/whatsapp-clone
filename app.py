from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import sqlite3
from datetime import datetime
import os

app = Flask(__name__)
app.secret_key = os.urandom(24)

# Database connection helper
def get_db_connection():
    conn = sqlite3.connect('chat.db')
    conn.row_factory = sqlite3.Row
    return conn

# Routes
@app.route('/')
def home():
    if 'user_id' in session:
        return redirect(url_for('chat'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        phone = request.form.get('phone')
        name = request.form.get('name')
        
        if not phone or not name:
            return render_template('login.html', error='Phone and name are required')
        
        conn = get_db_connection()
        try:
            # Check if user exists
            user = conn.execute('SELECT * FROM users WHERE phone = ?', (phone,)).fetchone()
            
            if not user:
                # Create new user
                conn.execute('INSERT INTO users (phone, name) VALUES (?, ?)', (phone, name))
                conn.commit()
                user_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
            else:
                user_id = user['id']
            
            session['user_id'] = user_id
            session['user_name'] = name
            session['user_phone'] = phone
            return redirect(url_for('chat'))
            
        except sqlite3.Error as e:
            return render_template('login.html', error=str(e))
        finally:
            conn.close()
    
    return render_template('login.html')

@app.route('/chat')
def chat():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    return render_template('chat.html')

@app.route('/api/chats', methods=['GET'])
def get_chats():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    user_id = session['user_id']
    
    conn = get_db_connection()
    try:
        # Get all chats for the user
        chats = conn.execute('''
            SELECT c.id, 
                   CASE 
                       WHEN c.user1_id = ? THEN u2.id
                       ELSE u1.id
                   END as contact_id,
                   CASE 
                       WHEN c.user1_id = ? THEN u2.name
                       ELSE u1.name
                   END as contact_name,
                   CASE 
                       WHEN c.user1_id = ? THEN u2.phone
                       ELSE u1.phone
                   END as contact_phone,
                   (SELECT m.message FROM messages m WHERE m.chat_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
                   (SELECT m.created_at FROM messages m WHERE m.chat_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_time
            FROM chats c
            JOIN users u1 ON c.user1_id = u1.id
            JOIN users u2 ON c.user2_id = u2.id
            WHERE c.user1_id = ? OR c.user2_id = ?
            ORDER BY last_message_time DESC
        ''', (user_id, user_id, user_id, user_id, user_id)).fetchall()
        
        return jsonify([dict(chat) for chat in chats])
    finally:
        conn.close()

@app.route('/api/contacts', methods=['GET'])
def get_contacts():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    user_id = session['user_id']
    
    conn = get_db_connection()
    try:
        # Get all contacts (users except current user)
        contacts = conn.execute('''
            SELECT id, name, phone 
            FROM users 
            WHERE id != ?
            ORDER BY name
        ''', (user_id,)).fetchall()
        
        return jsonify([dict(contact) for contact in contacts])
    finally:
        conn.close()

@app.route('/api/chat/<int:contact_id>', methods=['GET', 'POST'])
def handle_chat(contact_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    user_id = session['user_id']
    
    conn = get_db_connection()
    try:
        # Find or create chat
        chat = conn.execute('''
            SELECT id FROM chats 
            WHERE (user1_id = ? AND user2_id = ?) 
               OR (user1_id = ? AND user2_id = ?)
        ''', (user_id, contact_id, contact_id, user_id)).fetchone()
        
        if not chat:
            # Create new chat
            conn.execute('INSERT INTO chats (user1_id, user2_id) VALUES (?, ?)', 
                        (min(user_id, contact_id), max(user_id, contact_id)))
            conn.commit()
            chat_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        else:
            chat_id = chat['id']
        
        if request.method == 'GET':
            # Get messages for this chat
            messages = conn.execute('''
                SELECT m.id, m.message, m.status, m.created_at, u.name as sender_name
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                WHERE m.chat_id = ?
                ORDER BY m.created_at
            ''', (chat_id,)).fetchall()
            
            return jsonify([dict(msg) for msg in messages])
        
        elif request.method == 'POST':
            # Post new message
            message = request.json.get('message')
            
            if not message:
                return jsonify({'error': 'Message is required'}), 400
            
            conn.execute('''
                INSERT INTO messages (chat_id, sender_id, message)
                VALUES (?, ?, ?)
            ''', (chat_id, user_id, message))
            conn.commit()
            
            # Get the newly created message
            new_message = conn.execute('''
                SELECT m.id, m.message, m.status, m.created_at, u.name as sender_name
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                WHERE m.id = last_insert_rowid()
            ''').fetchone()
            
            return jsonify(dict(new_message)), 201
            
    except sqlite3.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

if __name__ == '__main__':
    app.run(debug=True)