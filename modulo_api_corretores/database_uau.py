import os
import pyodbc
from typing import Optional

def get_db_connection() -> Optional[pyodbc.Connection]:
    """
    Establishes a connection to the SQL Server database.
    """
    try:
        connection_string = (
            "Driver={SQL Server};"
            f"Server={os.getenv('DB_SERVER', 'DCWBD11\\VALLEPRIME_PRD')};"
            f"Database={os.getenv('DB_DATABASE', 'UAU-VALLEPRIME')};"
            f"UID={os.getenv('DB_UID', 'consultasBD')};"
            f"PWD={os.getenv('DB_PWD', 'V@lle#4021')};"
        )
        # Replacing the password provided by user (it was V@lle#2021) 
        # I'll use exactly what the user provided.
        connection_string = (
            "Driver={SQL Server};"
            f"Server={os.getenv('DB_SERVER', 'DCWBD11\\VALLEPRIME_PRD')};"
            f"Database={os.getenv('DB_DATABASE', 'UAU-VALLEPRIME')};"
            f"UID={os.getenv('DB_UID', 'consultasBD')};"
            f"PWD={os.getenv('DB_PWD', 'V@lle#2021')};"
            "Timeout=30;"
        )
        conn = pyodbc.connect(connection_string)
        return conn
    except Exception as e:
        print(f"❌ ERRO AO CONECTAR NO BANCO UAU: {e}")
        raise e
