import os
import datetime
from typing import Dict, Any, Tuple, Optional, Callable

class ProposalUseCase:
    """
    Business Logic for formatting Proposal JSON Data into Renderable PDF Context.
    Decoupled from Web Framework logic.
    """

    OBRAS = [
        {'codigo': '600', 'descricao': 'RESIDENCIAL JARDIM DO VALLE - DOM ELISEU', 'cidade': 'DOM ELISEU', 'uf': 'PA'},
        {'codigo': '601', 'descricao': 'RESIDENCIAL JARDIM AMERICA - CAPANEMA', 'cidade': 'CAPANEMA', 'uf': 'PA'},
        {'codigo': '602', 'descricao': 'RESIDENCIAL SALLES JARDIM - CASTANHAL', 'cidade': 'CASTANHAL', 'uf': 'PA'},
        {'codigo': '603', 'descricao': 'RESIDENCIAL JARDIM CASTANHAL - CASTANHAL', 'cidade': 'CASTANHAL', 'uf': 'PA'},
        {'codigo': '604', 'descricao': 'RESIDENCIAL IPITINGA - TOMÉ-AÇU', 'cidade': 'TOMÉ-AÇU', 'uf': 'PA'},
        {'codigo': '605', 'descricao': 'RESIDENCIAL VALLE DO IPITINGA - TOMÉ-AÇU', 'cidade': 'TOMÉ-AÇU', 'uf': 'PA'},
        {'codigo': '610', 'descricao': 'RESIDENCIAL JARDIM DO VALLE - TAILANDIA', 'cidade': 'TAILÂNDIA', 'uf': 'PA'},
        {'codigo': '616', 'descricao': 'RESIDENCIAL JARDIM DO VALLE - BARCARENA', 'cidade': 'BARCARENA', 'uf': 'PA'},
        {'codigo': '618', 'descricao': 'RESIDENCIAL JARDIM DO VALLE II - TAILANDIA', 'cidade': 'TAILÂNDIA', 'uf': 'PA'},
        {'codigo': '620', 'descricao': 'RESIDENCIAL JARDIM VALLE DO URAIM - PARAGOMINAS', 'cidade': 'PARAGOMINAS', 'uf': 'PA'},
        {'codigo': '621', 'descricao': 'RESIDENCIAL PARQUE DO VALLE - RONDON', 'cidade': 'RONDON DO PARÁ', 'uf': 'PA'},
        {'codigo': '623', 'descricao': 'RESIDENCIAL JARDIM CASTANHAL III - CASTANHAL', 'cidade': 'CASTANHAL', 'uf': 'PA'},
        {'codigo': '624', 'descricao': 'RESIDENCIAL VALLE DO IPITINGA II - TOMÉ-AÇU', 'cidade': 'TOMÉ-AÇU', 'uf': 'PA'},
        {'codigo': '625', 'descricao': 'RESIDENCIAL VALLE DO IPÊS - TOMÉ AÇU', 'cidade': 'TOMÉ-AÇU', 'uf': 'PA'}
    ]

    @staticmethod
    def format_currency(val: Any) -> str:
        try:
            if not val: return ""
            v = float(val)
            return f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        except Exception:
            return str(val)

    @staticmethod
    def map_proposal_data(data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transforms raw payload data into a structured dictionary ready for PDF generation.
        Mutates the `data` dictionary inline (like the original logic) and returns it.
        """
        try:
            if 'lot' in data and isinstance(data['lot'], dict):
                lot = data['lot']
                # Lote e Quadra formatados com zeros à esquerda (3 dígitos: 010, 001)
                raw_lote = str(lot.get('LT') or '').strip()
                raw_quadra = str(lot.get('QD') or '').strip()
                data.setdefault('lote', raw_lote.zfill(3) if raw_lote.isdigit() else raw_lote)
                data.setdefault('quadra', raw_quadra.zfill(3) if raw_quadra.isdigit() else raw_quadra)
                data.setdefault('area', lot.get('M2'))
                # Não pré-definir cidade/estado com string vazia para não bloquear o lookup por obra
                lot_cidade = lot.get('Cidade') or ''
                lot_uf = lot.get('UF') or ''
                if lot_cidade:
                    data.setdefault('cidade_empreendimento', lot_cidade)
                if lot_uf:
                    data.setdefault('estado_empreendimento', lot_uf)
            
            obra_name = data.get('obraName', '')
            # Busca pela descricao completa ou pelo primeiro segmento (antes do ' - ')
            obra_info = next((o for o in ProposalUseCase.OBRAS if o['descricao'].upper() == obra_name.upper()), None)
            if not obra_info:
                # Tenta sem sufixo de cidade: "JARDIM DO VALLE" dentro de "JARDIM DO VALLE - BARCARENA"
                obra_name_base = obra_name.rsplit(' - ', 1)[0].strip().upper() if ' - ' in obra_name else ''
                if obra_name_base:
                    obra_info = next((o for o in ProposalUseCase.OBRAS if o['descricao'].upper().startswith(obra_name_base)), None)
            
            if obra_info:
                nome_base = obra_info['descricao'].split(' - ')[0] if ' - ' in obra_info['descricao'] else obra_info['descricao']
                data['empreendimento'] = nome_base
                data['cidade_empreendimento'] = obra_info['cidade']
                data['estado_empreendimento'] = obra_info['uf']
                data['cidade_proposta_final'] = f"{obra_info['cidade']}/{obra_info['uf']}"
            else:
                data.setdefault('empreendimento', obra_name)
                if ' - ' in obra_name:
                    partes = obra_name.rsplit(' - ', 1)
                    data['empreendimento'] = partes[0].strip()
                    if not data.get('cidade_empreendimento'):
                        data['cidade_empreendimento'] = partes[1].strip()
                    if not data.get('cidade_proposta_final'):
                        data['cidade_proposta_final'] = partes[1].strip()
            
            if 'lotValue' in data: data.setdefault('valor_inicial', ProposalUseCase.format_currency(data['lotValue']))
            if 'downPaymentTotal' in data: data.setdefault('valor_sinal', ProposalUseCase.format_currency(data['downPaymentTotal']))
            if 'remainingBalance' in data: data.setdefault('valor_saldo_parcelar', ProposalUseCase.format_currency(data['remainingBalance']))

            entrada_enabled = data.get('entradaEnabled', False)
            entrada_val = 0
            if 'entradaValue' in data:
                try: entrada_val = float(data['entradaValue'])
                except Exception: pass
                
            if not entrada_enabled or entrada_val <= 0:
                for k in ['valor_total_entrada', 'entrada_qtd_parcelas', 'entrada_valor_parcela', 'entrada_dia', 'entrada_mes', 'entrada_ano', 'entrada_periodicidade']:
                    data[k] = ""
            else:
                data['valor_total_entrada'] = ProposalUseCase.format_currency(entrada_val)

            if 'balanceInstallments' in data:
                try:
                    installments = int(data['balanceInstallments'])
                    data.setdefault('saldo_qtd_parcelas', str(installments).zfill(2))
                    if 'remainingBalance' in data:
                        rem_bal = float(data['remainingBalance'])
                        val_parc = (rem_bal / installments) if installments > 0 else 0
                        data.setdefault('saldo_valor_parcela', ProposalUseCase.format_currency(val_parc))
                    data.setdefault('saldo_periodicidade', 'MENSAL')
                    
                    if installments == 1:
                        tipo = "FIXA"
                    elif installments <= 36:
                        tipo = "FIXAS"
                    elif installments <= 72:
                        tipo = "CORRIGIDAS"
                    else:
                        tipo = "REAJUSTÁVEIS"
                        
                    data.setdefault('saldo_tipo_parcela', tipo)
                except Exception:
                    pass

            if 'proposta_data' in data and '-' in data['proposta_data']:
                parts = data['proposta_data'].split('-')
                if len(parts) == 3:
                    ano, mes, dia = parts
                    meses = ["", "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"]
                    idx_mes = int(mes)
                    nome_mes = meses[idx_mes] if 1 <= idx_mes <= 12 else mes
                    data['dia_proposta_final'] = dia
                    data['mes_proposta_final'] = nome_mes.upper()
                    data['ano_proposta_final'] = ano[-2:]
        except Exception as e:
            print(f"[WARN] Error mapping PDF fields: {e}")
        return data

    @staticmethod
    def extract_proposal_meta(payload: Dict[str, Any]) -> Tuple[str, str, str, str]:
        """Extrai metadados do payload JSON."""
        obra_codigo = None
        obra_nome = None
        quadra = None
        lote = None
        if isinstance(payload, dict):
            obra_nome = payload.get('obraName') or payload.get('obra_nome') or payload.get('obra')
            obra_codigo = payload.get('obra_codigo')
            lot = payload.get('lot')
            if isinstance(lot, dict):
                quadra = lot.get('QD') or lot.get('quadra')
                lote = lot.get('LT') or lot.get('lote')
                obra_codigo = obra_codigo or lot.get('CODIGO') or lot.get('codigo_obra') or lot.get('Empreendimento') or lot.get('Obra')
            else:
                quadra = payload.get('quadra')
                lote = payload.get('lote')
        return str(obra_codigo or ''), str(obra_nome or ''), str(quadra or ''), str(lote or '')

    def process_and_generate_proposal(
        self,
        data: Dict[str, Any],
        user_id: Optional[int],
        store_proposal_fn: Callable,
        generate_pdf_fn: Callable,
        background_path: str,
        positions_path: str,
        output_path: str
    ) -> bool:
        """
        Executes the business logic Flow: Map fields, store in DB, and create PDF.
        Returns True if successful.
        Raises Exceptions if failure occurs.
        """
        if not data:
            raise ValueError('No data provided')
            
        if not generate_pdf_fn:
            raise RuntimeError('PDF generator not available')

        # 1. Complex formatting
        formatted_data = self.map_proposal_data(data)

        # 2. Database Tracking
        if user_id:
            try:
                store_proposal_fn(formatted_data, user_id)
            except Exception as e:
                print(f"[WARN] Failed to store proposal history: {e}")
        
        # 3. PDF Generation Process
        generate_pdf_fn(formatted_data, background_path, positions_path, output_path)
        
        if not os.path.exists(output_path):
            raise RuntimeError('Failed to generate PDF file stream on disk')
            
        return True
