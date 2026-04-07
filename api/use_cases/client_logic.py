import datetime
import json
import re
from typing import Dict, Any, List, Optional, Callable

class ClientUseCase:
    """
    Business Logic for Client Management.
    Handles permissions, duplicate checks, and data mapping.
    """

    @staticmethod
    def _parse_permissions(user_record: Optional[Dict]) -> Dict:
        if not user_record:
            return {}
        perms = user_record.get('permissions', {})
        if isinstance(perms, str):
            try:
                return json.loads(perms)
            except:
                return {}
        return perms or {}

    def fetch_clients(
        self,
        user_id: int,
        user_role: str,
        client_type: str,
        requested_created_by: Optional[str],
        get_user_fn: Callable,
        get_clients_fn: Callable
    ) -> List[Dict]:
        """
        Calculates which clients a user is allowed to see.
        """
        user_record = get_user_fn(user_id)
        perms = self._parse_permissions(user_record)
        can_see_all = (user_role == 'admin') or perms.get('canViewAllClients', False)

        force_created_by = None
        if requested_created_by and (user_role == 'admin' or str(requested_created_by) == str(user_id)):
            force_created_by = str(requested_created_by)

        if can_see_all:
            return get_clients_fn(client_type, force_created_by)
        else:
            return get_clients_fn(client_type, str(user_id))

    def save_client(
        self,
        user_id: int,
        user_role: str,
        data: Dict[str, Any],
        get_user_fn: Callable,
        get_client_by_id_fn: Callable,
        get_clients_fn: Callable,
        create_client_fn: Callable,
        update_client_fn: Callable
    ) -> Dict[str, Any]:
        """
        Logic for creating or updating a client (by ID or CPF/CNPJ).
        """
        if not data:
            raise ValueError('No data provided')

        # 1. Identity Extraction
        client_id_raw = data.get('client_id')
        client_id = None
        if client_id_raw:
            match = re.search(r'\d+', str(client_id_raw))
            if match:
                client_id = int(match.group())

        nome = data.get('nome') or data.get('nome_proponente') or data.get('razao_social_proponente')
        cpf_cnpj = data.get('cpf_cnpj') or data.get('cpf_cnpj_proponente')
        tipo_pessoa = data.get('tipo_pessoa', 'PF')

        if not nome or not cpf_cnpj:
            raise ValueError('Nome e CPF/CNPJ são obrigatórios')

        # 2. Update logic if client_id exists
        if client_id:
            existing = get_client_by_id_fn(client_id)
            if not existing:
                raise KeyError('Cliente não encontrado')

            user_record = get_user_fn(user_id)
            perms = self._parse_permissions(user_record)
            can_update_any = (user_role == 'admin') or perms.get('canViewAllClients', False)

            if not can_update_any and str(existing.get('created_by')) != str(user_id):
                raise PermissionError('Sem permissão para atualizar este cliente')

            updated_at = datetime.datetime.now().isoformat()
            success = update_client_fn(client_id, nome, cpf_cnpj, tipo_pessoa, data, updated_at)
            if success:
                return {'success': True, 'message': 'Cliente atualizado com sucesso', 'mode': 'update_by_id'}
            raise RuntimeError('Falha ao atualizar no banco de dados')

        # 3. Duplicate check for implicit update
        existing_id = None
        for c in get_clients_fn(tipo_pessoa, str(user_id)):
            if c.get('cpf_cnpj') == cpf_cnpj:
                existing_id = c.get('id')
                break
        
        if existing_id:
            updated_at = datetime.datetime.now().isoformat()
            success = update_client_fn(existing_id, nome, cpf_cnpj, tipo_pessoa, data, updated_at)
            if success:
                return {'success': True, 'message': 'Cliente atualizado com sucesso', 'mode': 'update_by_cpf'}
            raise RuntimeError('Falha ao atualizar no banco de dados')

        # 4. Create new
        success = create_client_fn(nome, cpf_cnpj, tipo_pessoa, str(user_id), data)
        if success:
            return {'success': True, 'message': 'Cliente salvo com sucesso', 'mode': 'create'}
        raise RuntimeError('Falha ao inserir no banco de dados')

    def delete_client(
        self,
        client_id: int,
        user_id: int,
        user_role: str,
        get_user_fn: Callable,
        delete_client_fn: Callable
    ) -> bool:
        user_record = get_user_fn(user_id)
        perms = self._parse_permissions(user_record)
        can_delete_any = (user_role == 'admin') or perms.get('canViewAllClients', False)

        return delete_client_fn(client_id, None if can_delete_any else str(user_id))
