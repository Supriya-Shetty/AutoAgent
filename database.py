import sqlite3
import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent / "usage.db"

def init_db():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        # Enable WAL (Write-Ahead Logging) for better concurrency
        cursor.execute('PRAGMA journal_mode=WAL;')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS usage (
                user_id TEXT,
                date TEXT,
                request_count INTEGER,
                PRIMARY KEY (user_id, date)
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS chat_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                session_id TEXT,
                role TEXT,
                content TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                uid TEXT PRIMARY KEY,
                email TEXT,
                is_blocked INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS ai_providers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                base_url TEXT NOT NULL,
                api_key TEXT,
                model TEXT NOT NULL,
                is_active INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Add default 'devproxy' provider if it doesn't exist
        cursor.execute("SELECT COUNT(*) FROM ai_providers WHERE name = 'devproxy'")
        if cursor.fetchone()[0] == 0:
            cursor.execute('''
                INSERT INTO ai_providers (name, base_url, api_key, model, is_active)
                VALUES (?, ?, ?, ?, ?)
            ''', ('devproxy', 'https://autoagent-proxy.deviprasadshetty400.workers.dev/v1', '', 'openrouter/free', 1))
            print("✅ Default provider 'devproxy' added to database.")

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"❌ Database initialization error: {e}")

def get_ai_providers():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('SELECT id, name, base_url, api_key, model, is_active, created_at FROM ai_providers ORDER BY created_at DESC')
        rows = cursor.fetchall()
        conn.close()
        return [
            {
                "id": row[0],
                "name": row[1],
                "base_url": row[2],
                "api_key": f"{row[3][:6]}...{row[3][-4:]}" if row[3] and len(row[3]) > 10 else "********" if row[3] else None,
                "model": row[4],
                "is_active": bool(row[5]),
                "created_at": row[6]
            } for row in rows
        ]
    except Exception as e:
        print(f"❌ Error getting AI providers: {e}")
        return []

def add_ai_provider(name: str, base_url: str, api_key: str, model: str):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO ai_providers (name, base_url, api_key, model)
            VALUES (?, ?, ?, ?)
        ''', (name, base_url, api_key, model))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"❌ Error adding AI provider: {e}")
        return False

def update_ai_provider(provider_id: int, name: str, base_url: str, api_key: str, model: str):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        if api_key:
            cursor.execute('''
                UPDATE ai_providers 
                SET name = ?, base_url = ?, api_key = ?, model = ?
                WHERE id = ?
            ''', (name, base_url, api_key, model, provider_id))
        else:
            cursor.execute('''
                UPDATE ai_providers 
                SET name = ?, base_url = ?, model = ?
                WHERE id = ?
            ''', (name, base_url, model, provider_id))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"❌ Error updating AI provider: {e}")
        return False

def delete_ai_provider(provider_id: int):
    """Delete an AI provider."""
    try:
        conn = sqlite3.connect("usage.db")
        cursor = conn.cursor()
        cursor.execute("DELETE FROM ai_providers WHERE id = ?", (provider_id,))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error deleting provider: {e}")
        return False


def update_ai_provider(provider_id: int, name: str, base_url: str, api_key: str, model: str):
    """Update an existing AI provider."""
    try:
        conn = sqlite3.connect("usage.db")
        cursor = conn.cursor()
        
        # Build query dynamically to only update api_key if provided
        if api_key and api_key.strip():
            cursor.execute('''
                UPDATE ai_providers 
                SET name = ?, base_url = ?, api_key = ?, model = ? 
                WHERE id = ?
            ''', (name, base_url, api_key, model, provider_id))
        else:
            cursor.execute('''
                UPDATE ai_providers 
                SET name = ?, base_url = ?, model = ? 
                WHERE id = ?
            ''', (name, base_url, model, provider_id))
            
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error updating provider: {e}")
        return False

def set_active_provider(provider_id: int):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        # Deactivate all
        cursor.execute('UPDATE ai_providers SET is_active = 0')
        # Activate one
        cursor.execute('UPDATE ai_providers SET is_active = 1 WHERE id = ?', (provider_id,))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"❌ Error setting active provider: {e}")
        return False

def get_active_provider():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('SELECT name, base_url, api_key, model FROM ai_providers WHERE is_active = 1 LIMIT 1')
        row = cursor.fetchone()
        conn.close()
        if row:
            return {
                "name": row[0],
                "base_url": row[1],
                "api_key": row[2],
                "model": row[3]
            }
        return None
    except Exception as e:
        print(f"❌ Error getting active provider: {e}")
        return None

def increment_usage(user_id: str):
    try:
        today = datetime.date.today().isoformat()
        conn = sqlite3.connect(DB_PATH)
        # Increase timeout for busy database
        conn.execute('PRAGMA busy_timeout = 5000')
        cursor = conn.cursor()
        
        # Use UPSERT (Update if exists, Insert if not)
        cursor.execute('''
            INSERT INTO usage (user_id, date, request_count)
            VALUES (?, ?, 1)
            ON CONFLICT(user_id, date) DO UPDATE SET
            request_count = request_count + 1
        ''', (user_id, today))
        
        conn.commit()
        
        # Get total for today for the user
        cursor.execute('SELECT request_count FROM usage WHERE user_id = ? AND date = ?', (user_id, today))
        count = cursor.fetchone()[0]
        
        conn.close()
        return count
    except Exception as e:
        print(f"❌ Error incrementing usage: {e}")
        return 0

def get_today_usage(user_id: str):
    today = datetime.date.today().isoformat()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT request_count FROM usage WHERE user_id = ? AND date = ?', (user_id, today))
    result = cursor.fetchone()
    conn.close()
    return result[0] if result else 0

def save_message(user_id: str, session_id: str, role: str, content: str):
    try:
        if not content or not content.strip():
            return
        
        conn = sqlite3.connect(DB_PATH)
        conn.execute('PRAGMA busy_timeout = 5000')
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO chat_history (user_id, session_id, role, content)
            VALUES (?, ?, ?, ?)
        ''', (user_id, session_id, role, content))
        conn.commit()
        conn.close()
        print(f"✅ Saved message for {user_id} in session {session_id} ({role})")
    except Exception as e:
        print(f"❌ Error saving message: {e}")

def get_session_history(user_id: str, session_id: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        SELECT role, content, timestamp 
        FROM chat_history 
        WHERE user_id = ? AND session_id = ? 
        ORDER BY timestamp ASC
    ''', (user_id, session_id))
    history = cursor.fetchall()
    conn.close()
    return [{"role": row[0], "content": row[1], "timestamp": row[2]} for row in history]

def get_user_sessions(user_id: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # Get unique session IDs with the first message content as the title
    cursor.execute('''
        SELECT session_id, 
               (SELECT content FROM chat_history ch2 WHERE ch2.session_id = ch.session_id AND ch2.user_id = ch.user_id ORDER BY timestamp ASC LIMIT 1) as title,
               MAX(timestamp) as last_active
        FROM chat_history ch
        WHERE user_id = ?
        GROUP BY session_id
        ORDER BY last_active DESC
    ''', (user_id,))
    sessions = cursor.fetchall()
    conn.close()
    return [{"session_id": row[0], "title": row[1], "last_active": row[2]} for row in sessions]

def delete_user_session(user_id: str, session_id: str):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute('PRAGMA busy_timeout = 5000')
        cursor = conn.cursor()
        cursor.execute('''
            DELETE FROM chat_history 
            WHERE user_id = ? AND session_id = ?
        ''', (user_id, session_id))
        conn.commit()
        conn.close()
        print(f"🗑️ Deleted session {session_id} for user {user_id}")
    except Exception as e:
        print(f"❌ Error deleting session: {e}")

def register_user(uid: str, email: str):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute('PRAGMA busy_timeout = 5000')
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO users (uid, email) 
            VALUES (?, ?)
            ON CONFLICT(uid) DO UPDATE SET 
            email = excluded.email,
            last_login = CURRENT_TIMESTAMP
        ''', (uid, email))
        conn.commit()
        conn.close()
        print(f"👤 Registered/Updated user: {email}")
    except Exception as e:
        print(f"❌ Error registering user: {e}")

def is_user_blocked(uid: str):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('SELECT is_blocked FROM users WHERE uid = ?', (uid,))
        result = cursor.fetchone()
        conn.close()
        return result[0] == 1 if result else False
    except Exception as e:
        print(f"❌ Error checking block status: {e}")
        return False

def set_user_block_status(uid: str, is_blocked: bool):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET is_blocked = ? WHERE uid = ?', (1 if is_blocked else 0, uid))
        conn.commit()
        conn.close()
        print(f"🛡️ User {uid} block status set to {is_blocked}")
    except Exception as e:
        print(f"❌ Error setting block status: {e}")

def get_admin_stats():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        stats = {}
        # Total Users
        cursor.execute('SELECT COUNT(*) FROM users')
        stats['total_users'] = cursor.fetchone()[0]
        
        # Total Logins (Approx by entries in usage or based on users table)
        cursor.execute('SELECT COUNT(*) FROM users WHERE last_login >= date("now")')
        stats['today_logins'] = cursor.fetchone()[0]
        
        # Total Messages
        cursor.execute('SELECT COUNT(*) FROM chat_history')
        stats['total_messages'] = cursor.fetchone()[0]
        
        # Daily Activity (last 7 days)
        cursor.execute('''
            SELECT date(timestamp) as day, COUNT(*) as count 
            FROM chat_history 
            WHERE timestamp >= date("now", "-7 days")
            GROUP BY day
            ORDER BY day ASC
        ''')
        stats['daily_activity'] = [{"day": row[0], "count": row[1]} for row in cursor.fetchall()]
        
        conn.close()
        return stats
    except Exception as e:
        print(f"❌ Error getting admin stats: {e}")
        return {}

def get_all_users_with_counts():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            SELECT u.uid, u.email, u.is_blocked, u.created_at, u.last_login,
                   (SELECT COUNT(*) FROM chat_history ch WHERE ch.user_id = u.uid) as message_count
            FROM users u
            ORDER BY u.created_at DESC
        ''')
        rows = cursor.fetchall()
        conn.close()
        return [
            {
                "uid": row[0],
                "email": row[1],
                "is_blocked": bool(row[2]),
                "created_at": row[3],
                "last_login": row[4],
                "message_count": row[5]
            } for row in rows
        ]
    except Exception as e:
        print(f"❌ Error getting users with counts: {e}")
        return []

# Initialize database on module load
init_db()
