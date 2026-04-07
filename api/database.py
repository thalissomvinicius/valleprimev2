"""
Database module - Refactored for Clean Architecture (Phase 1)
All data operations go through the Supabase PostgREST endpoint.
"""
import os
import json
import requests
from datetime import datetime
from typing import Any, Dict, List, Optional, Union

# ==========================================
# 1. Configuration & Core HTTP Client
# ==========================================

class SupabaseConfig:
    URL: str = os.environ.get('SUPABASE_URL', '').rstrip('/')
    KEY: str = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_ANON_KEY', '')
    TIMEOUT: int = 8

class SupabaseClient:
    """Core HTTP Client for database communication."""
    
    @staticmethod
    def _build_headers(method: str) -> Dict[str, str]:
        headers = {
            "apikey": SupabaseConfig.KEY,
            "Authorization": f"Bearer {SupabaseConfig.KEY}",
            "Content-Type": "application/json",
        }
        if method in ['POST', 'PATCH']:
            headers["Prefer"] = "return=representation"
        elif method == 'DELETE':
            headers["Prefer"] = "return=minimal"
        return headers

    @classmethod
    def request(cls, table: str, method: str = 'GET', params: str = None, data: dict = None, expect_single: bool = False) -> Any:
        if not SupabaseConfig.URL or not SupabaseConfig.KEY:
            raise ConnectionError("SUPABASE_URL and SUPABASE_KEY must be set in environment variables.")
        
        url = f"{SupabaseConfig.URL}/rest/v1/{table}"
        if params:
            url = f"{url}?{params}"
            
        try:
            response = requests.request(
                method=method,
                url=url,
                headers=cls._build_headers(method),
                json=data,
                timeout=SupabaseConfig.TIMEOUT
            )
            
            if response.status_code not in [200, 201, 204, 206]:
                print(f"[SUPABASE ERROR] {method} {table}: {response.status_code} - {response.text[:200]}")
                return None
            
            if not response.text or response.status_code == 204:
                return True
                
            result = response.json()
            
            if expect_single and isinstance(result, list):
                return result[0] if result else None
                
            return result
            
        except requests.exceptions.Timeout:
            print(f"[SUPABASE TIMEOUT] {method} {table}")
            raise
        except Exception as e:
            print(f"[SUPABASE ERROR] {method} {table}: {e}")
            raise


# ==========================================
# 2. Base & Domain Repositories
# ==========================================

class BaseRepository:
    """Base generic repository for interacting with a specific table."""
    def __init__(self, table_name: str):
        self.table = table_name

    def execute(self, method: str, params: str = None, data: dict = None, expect_single: bool = False):
        return SupabaseClient.request(self.table, method, params, data, expect_single)
        
    @staticmethod
    def _parse_json_field(field_data: Union[str, Dict, Any]) -> Dict:
        """Helper to ensure JSON fields are properly parsed."""
        if isinstance(field_data, dict):
            return field_data
        if isinstance(field_data, str):
            try:
                return json.loads(field_data)
            except json.JSONDecodeError:
                return {}
        return {}


class UserRepository(BaseRepository):
    def __init__(self):
        super().__init__('users')

    def get_by_id(self, user_id: int) -> Optional[Dict]:
        return self.execute('GET', f"id=eq.{user_id}&select=*", expect_single=True)

    def get_by_username(self, username: str, active_only: bool = False) -> Optional[Dict]:
        params = f"username=eq.{username}&select=*"
        if active_only:
            params += "&active=eq.true"
        return self.execute('GET', params, expect_single=True)

    def get_all(self) -> List[Dict]:
        res = self.execute('GET', "select=id,username,nome,role,permissions,active&order=id.asc")
        return res if isinstance(res, list) else []

    def create(self, username: str, password_hash: str, nome: str, role: str, permissions: Any, active: bool = True) -> Any:
        payload = {
            "username": username,
            "password_hash": password_hash,
            "nome": nome,
            "role": role,
            "permissions": self._parse_json_field(permissions),
            "active": active
        }
        return self.execute('POST', data=payload)

    def update(self, user_id: int, updates: Dict) -> Any:
        if not updates:
            return True
        if 'permissions' in updates:
            updates['permissions'] = self._parse_json_field(updates['permissions'])
        return self.execute('PATCH', f"id=eq.{user_id}", data=updates)

    def delete(self, user_id: int) -> Any:
        return self.execute('DELETE', f"id=eq.{user_id}")

    def count(self) -> Dict[str, int]:
        res = self.execute('GET', "select=id")
        return {"count": len(res)} if isinstance(res, list) else {"count": 0}


class ClientRepository(BaseRepository):
    def __init__(self):
        super().__init__('clients')

    def get_all(self, tipo_pessoa: str, created_by: Optional[int] = None) -> List[Dict]:
        params = f"tipo_pessoa=eq.{tipo_pessoa}&order=created_at.desc&select=*"
        if created_by:
            params += f"&created_by=eq.{created_by}"
        res = self.execute('GET', params)
        return res if isinstance(res, list) else []

    def check_duplicate(self, cpf_cnpj: str, exclude_id: Optional[int] = None) -> Optional[Dict]:
        params = f"cpf_cnpj=eq.{cpf_cnpj}&select=id,nome"
        if exclude_id:
            params += f"&id=neq.{exclude_id}"
        return self.execute('GET', params, expect_single=True)

    def get_by_id(self, client_id: int) -> Optional[Dict]:
        return self.execute('GET', f"id=eq.{client_id}&select=*", expect_single=True)

    def create(self, nome: str, cpf_cnpj: str, tipo_pessoa: str, created_by: int, data_dict: Any) -> Any:
        payload = {
            "nome": nome,
            "cpf_cnpj": cpf_cnpj,
            "tipo_pessoa": tipo_pessoa,
            "created_by": created_by,
            "data": self._parse_json_field(data_dict)
        }
        return self.execute('POST', data=payload)

    def update(self, client_id: int, nome: str, cpf_cnpj: str, tipo_pessoa: str, data_dict: Any, updated_at: str) -> Any:
        payload = {
            "nome": nome,
            "cpf_cnpj": cpf_cnpj,
            "tipo_pessoa": tipo_pessoa,
            "data": self._parse_json_field(data_dict),
            "updated_at": updated_at
        }
        return self.execute('PATCH', f"id=eq.{client_id}", data=payload)

    def delete(self, client_id: int, user_id_filter: Optional[int] = None) -> Any:
        params = f"id=eq.{client_id}"
        if user_id_filter:
            params += f"&created_by=eq.{user_id_filter}"
        return self.execute('DELETE', params)

    def count(self) -> Dict[str, int]:
        res = self.execute('GET', "select=id")
        return {"count": len(res)} if isinstance(res, list) else {"count": 0}

    def get_recent(self, limit: int = 5) -> List[Dict]:
        res = self.execute('GET', f"select=id,nome,created_at,created_by&order=id.desc&limit={limit}")
        return res if isinstance(res, list) else []


class ProposalRepository(BaseRepository):
    def __init__(self):
        super().__init__('proposals')

    def get_all(self, user_id: Optional[int] = None, limit: int = 50, offset: int = 0) -> List[Dict]:
        params = f"select=id,user_id,obra_codigo,obra_nome,quadra,lote,payload,created_at,updated_at&order=created_at.desc&limit={limit}&offset={offset}"
        if user_id:
            params += f"&user_id=eq.{user_id}"
        res = self.execute('GET', params)
        return res if isinstance(res, list) else []

    def get_by_id(self, proposal_id: int) -> Optional[Dict]:
        return self.execute('GET', f"id=eq.{proposal_id}&select=*", expect_single=True)

    def count(self, user_id: Optional[int] = None) -> Dict[str, int]:
        params = "select=id"
        if user_id:
            params += f"&user_id=eq.{user_id}"
        res = self.execute('GET', params)
        return {"count": len(res)} if isinstance(res, list) else {"count": 0}

    def create(self, user_id: int, obra_codigo: str, obra_nome: str, quadra: str, lote: str, payload: Any) -> Any:
        data = {
            "user_id": user_id,
            "obra_codigo": obra_codigo,
            "obra_nome": obra_nome,
            "quadra": quadra,
            "lote": lote,
            "payload": self._parse_json_field(payload)
        }
        return self.execute('POST', data=data)

    def update(self, proposal_id: int, obra_codigo: str, obra_nome: str, quadra: str, lote: str, payload: Any) -> Any:
        data = {
            "obra_codigo": obra_codigo,
            "obra_nome": obra_nome,
            "quadra": quadra,
            "lote": lote,
            "payload": self._parse_json_field(payload),
            "updated_at": datetime.now().isoformat()
        }
        return self.execute('PATCH', f"id=eq.{proposal_id}", data=data)

    def delete(self, proposal_id: int) -> Any:
        return self.execute('DELETE', f"id=eq.{proposal_id}")


class AlertRepository(BaseRepository):
    def __init__(self):
        super().__init__('lot_alerts')

    def create(self, obra_codigo: str, lote_id: str, status_anterior: str, novo_status: str, mensagem: str) -> Any:
        data = {
            "obra_codigo": obra_codigo,
            "lote_id": lote_id,
            "status_anterior": status_anterior,
            "novo_status": novo_status,
            "mensagem": mensagem,
            "created_at": datetime.now().isoformat()
        }
        return self.execute('POST', data=data)

    def get_recent(self, limit: int = 10) -> List[Dict]:
        res = self.execute('GET', f"select=*&order=created_at.desc&limit={limit}")
        return res if isinstance(res, list) else []

# ==========================================
# 3. Backwards Compatibility Export Hooks
# ==========================================
# All functions below maintain 100% existing contract with `api/index.py`
# while serving as facades to the new Architecture classes.

_user_repo = UserRepository()
_client_repo = ClientRepository()
_proposal_repo = ProposalRepository()
_alert_repo = AlertRepository()

# Users
def get_user_by_id(user_id): return _user_repo.get_by_id(user_id)
def get_user_by_username(username, active_only=False): return _user_repo.get_by_username(username, active_only)
def get_all_users(): return _user_repo.get_all()
def create_user(username, password_hash, nome, role, permissions, active=True): return _user_repo.create(username, password_hash, nome, role, permissions, active)
def update_user(user_id, updates): return _user_repo.update(user_id, updates)
def delete_user(user_id): return _user_repo.delete(user_id)
def count_users(): return _user_repo.count()

# Clients
def get_clients(tipo_pessoa, created_by=None): return _client_repo.get_all(tipo_pessoa, created_by)
def check_duplicate_client(cpf_cnpj, exclude_id=None): return _client_repo.check_duplicate(cpf_cnpj, exclude_id)
def get_client_by_id(client_id): return _client_repo.get_by_id(client_id)
def create_client(nome, cpf_cnpj, tipo_pessoa, created_by, data_dict): return _client_repo.create(nome, cpf_cnpj, tipo_pessoa, created_by, data_dict)
def update_client(client_id, nome, cpf_cnpj, tipo_pessoa, data_dict, updated_at): return _client_repo.update(client_id, nome, cpf_cnpj, tipo_pessoa, data_dict, updated_at)
def delete_client(client_id, user_id_filter=None): return _client_repo.delete(client_id, user_id_filter)
def count_clients(): return _client_repo.count()
def get_recent_clients(limit=5): return _client_repo.get_recent(limit)

# Proposals
def get_proposals(user_id=None, limit=50, offset=0): return _proposal_repo.get_all(user_id, limit, offset)
def get_proposal_by_id(proposal_id): return _proposal_repo.get_by_id(proposal_id)
def count_proposals(user_id=None): return _proposal_repo.count(user_id)
def create_proposal(user_id, obra_codigo, obra_nome, quadra, lote, payload): return _proposal_repo.create(user_id, obra_codigo, obra_nome, quadra, lote, payload)
def update_proposal(proposal_id, obra_codigo, obra_nome, quadra, lote, payload): return _proposal_repo.update(proposal_id, obra_codigo, obra_nome, quadra, lote, payload)
def delete_proposal(proposal_id): return _proposal_repo.delete(proposal_id)

# Alerts
def create_alert(obra_codigo, lote_id, status_anterior, novo_status, mensagem): return _alert_repo.create(obra_codigo, lote_id, status_anterior, novo_status, mensagem)
def get_recent_alerts(limit=10): return _alert_repo.get_recent(limit)
