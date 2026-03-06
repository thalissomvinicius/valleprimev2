import os
import sys

# Add api to path so we can import database
sys.path.insert(0, os.path.abspath('api'))

from database import create_user, get_user_by_username

# Try to get admin
admin = get_user_by_username('admin')
print(f"Existing admin: {admin}")

if not admin:
    print("Creating admin...")
    default_hash = "a09be37937be13180bb2ef0133b37803df3bf7c2688029514e868f0b09315d16:1234567890abcdef1234567890abcdef"
    try:
        res = create_user('admin', default_hash, 'Administrador', 'admin', {"all": True}, True)
        print(f"Result: {res}")
    except Exception as e:
        print(f"Error: {e}")
