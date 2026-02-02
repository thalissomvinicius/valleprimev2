from flask import Flask, jsonify
import sys
import os

app = Flask(__name__)

@app.route('/api/hello')
def hello():
    return jsonify({
        "status": "ok",
        "message": "Minimal API is running",
        "python_version": sys.version,
        "env": {k: v for k, v in os.environ.items() if "KEY" not in k and "PASS" not in k and "TOKEN" not in k}
    })

@app.route('/api/auth/login', methods=['POST'])
def login_placeholder():
    return jsonify({"message": "API in Maintenance/Debug Mode"}), 503

# Vercel entry point
if __name__ == "__main__":
    app.run(debug=True)
