import hashlib
import secrets
import jwt
import json
from datetime import datetime, timedelta
from typing import Dict, Any, Callable, Optional

class AuthUseCase:
    """
    Business Logic for Authentication and Crypto boundary.
    Completely isolated from Web Frameworks (Flask/FastAPI).
    """

    def __init__(self, secret_key: str):
        self.secret_key = secret_key

    @staticmethod
    def hash_password(password: str) -> str:
        """Securely hash a cleartext password with PBKDF2 & Salt."""
        salt = secrets.token_hex(16)
        return hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000).hex() + ':' + salt

    @staticmethod
    def verify_password(stored_password: str, provided_password: str) -> bool:
        """Verify password supporting multiple legacy formats."""
        if not stored_password or not provided_password:
            return False
            
        try:
            # Format 1: PBKDF2 with salt (hash:salt)
            if ':' in stored_password:
                password_hash, salt = stored_password.split(':')
                new_hash = hashlib.pbkdf2_hmac('sha256', provided_password.encode(), salt.encode(), 100000).hex()
                return new_hash == password_hash
            
            # Format 2: Simple MD5 hash
            md5_hash = hashlib.md5(provided_password.encode()).hexdigest()
            if stored_password == md5_hash:
                return True
            
            # Format 3: Simple SHA256 hash
            sha256_hash = hashlib.sha256(provided_password.encode()).hexdigest()
            if stored_password == sha256_hash:
                return True
            
            # Format 4: Plain text comparison (for legacy/testing only)
            if stored_password == provided_password:
                return True
            
            return False
        except Exception as e:
            print(f"[AUTH_USECASE] Verify password error: {e}")
            return False

    def generate_token(self, user_id: int, role: str) -> str:
        """Generate JWT Token string."""
        payload = {
            'user_id': user_id,
            'role': role,
            'exp': datetime.utcnow() + timedelta(hours=12)
        }
        token = jwt.encode(payload, self.secret_key, algorithm="HS256")
        if isinstance(token, bytes):
            token = token.decode('utf-8')
        return token

    def verify_token(self, token: str) -> dict:
        """Verify JWT token and extract payload."""
        try:
            return jwt.decode(token, self.secret_key, algorithms=["HS256"])
        except Exception:
            raise ValueError("Token is invalid or expired")
            
    def execute_login(
        self, 
        username: str, 
        password: str, 
        get_user_fn: Callable, 
        count_users_fn: Callable, 
        create_user_fn: Callable
    ) -> Dict[str, Any]:
        """
        Executes the entire Login business flow.
        Raises ValueError with HTTP-like string messages if any validation fails.
        """
        if not username or not password:
            raise ValueError("Credentials required")
            
        try:
            user = get_user_fn(username, active_only=True)
            
            # System bootstrapping (Admin fallback)
            if not user and username == 'admin' and password == 'admin123':
                cnt_res = count_users_fn()
                if cnt_res and cnt_res.get('count', 0) == 0:
                    pw_hash = self.hash_password('admin123')
                    create_user_fn('admin', pw_hash, 'Admin', 'admin', {"canViewAllClients": True}, True)
                    user = get_user_fn('admin', active_only=True)
        except Exception as e:
            print(f"[AUTH_USECASE] Database lookup failed: {e}")
            user = None
                
        if not user:
            raise ValueError("Invalid credentials (User not found)")
            
        if not self.verify_password(user['password_hash'], password):
            raise ValueError("Invalid credentials (Password mismatch)")
            
        token = self.generate_token(user['id'], user['role'])
        
        # Safely parse JSON permissions from string dict-like DB formats
        perms = {}
        if user.get('permissions'):
            try:
                perms = json.loads(user['permissions']) if isinstance(user['permissions'], str) else user['permissions']
            except:
                pass
                
        return {
            'token': token,
            'user': {
                'id': user['id'],
                'username': user['username'],
                'nome': user.get('nome'),
                'role': user['role'],
                'permissions': perms
            }
        }
