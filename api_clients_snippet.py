
@app.route('/api/clients', methods=['GET', 'POST'])
def clients():
    try:
        conn = get_db()
        if request.method == 'GET':
            cursor = conn.execute("SELECT * FROM clients ORDER BY updated_at DESC")
            clients = [dict(row) for row in cursor.fetchall()]
            conn.close()
            return {"clients": clients}, 200
            
        if request.method == 'POST':
            req = request.json
            name = req.get('nome', '')
            cpf = req.get('cpf_cnpj', '')
            data_json = json.dumps(req.get('data', {}))
            now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            if not name or not cpf:
                return {"error": "Name and CPF required"}, 400
                
            existing = conn.execute("SELECT id FROM clients WHERE cpf_cnpj = ?", (cpf,)).fetchone()
            
            if existing:
                conn.execute("UPDATE clients SET nome = ?, data = ?, updated_at = ? WHERE id = ?", (name, data_json, now, existing['id']))
            else:
                conn.execute("INSERT INTO clients (nome, cpf_cnpj, data, updated_at) VALUES (?, ?, ?, ?)", (name, cpf, data_json, now))
                
            conn.commit()
            conn.close()
            return {"success": True}, 200
            
    except Exception as e:
        return {"error": str(e)}, 500
