from fastapi import APIRouter, Query, HTTPException, Depends
from typing import Optional
from datetime import datetime
import pandas as pd
from database_uau import get_db_connection
import math
try:
    from cache_supabase import salvar_cache, buscar_cache
    CACHE_ENABLED = True
except Exception:
    CACHE_ENABLED = False
    def salvar_cache(*a, **kw): return False
    def buscar_cache(*a, **kw): return None

router = APIRouter()

def fetch_dados_corretores(conn, empresa, obra, corretor_id=None, data_inicio=None, data_fim=None, mes=None):
    """
    Lista os corretores com base nos filtros dinâmicos de Data, Obra e Corretor passados pela Request.
    """
    # Fallback to current month se nada foi passado (mas suporta 'all')
    if not mes and not data_inicio and not data_fim:
        mes = 'all'

    # Trata data_inicio e data_fim se "mes" for passado e não for 'all'
    if mes and mes != 'all':
        try:
            # Ex: "2026-03" -> inicio: 20260301 / fim: 20260331
            dt = datetime.strptime(mes, '%Y-%m')
            ultimo_dia = pd.Period(mes).days_in_month
            data_inicio = dt.strftime('%Y%m') + '01'
            data_fim = dt.strftime('%Y%m') + str(ultimo_dia).zfill(2)
        except ValueError:
            pass # ignore se vier formato zoado, pega tudo
            
        print(f"DEBUG FILTER: mes={mes} -> data_inicio={data_inicio}, data_fim={data_fim}")

    # Constroi os blocos do Filtro
    filtros_vendas = f"Empresa_Ven = {empresa} AND Obra_Ven = '{obra}' AND TipoVenda_Ven IN (0,1,2,3,4,5)"
    filtros_vendas_rec = f"Empresa_VRec = {empresa} AND Obra_VRec = '{obra}' AND TipoVenda_VRec IN (0,1,2,3,4,5)"
    
    if corretor_id:
        filtros_vendas += f" AND Vendedor_Ven = {corretor_id}"
        filtros_vendas_rec += f" AND Vendedor_VRec = {corretor_id}"
    
    if data_inicio:
        filtros_vendas += f" AND Data_Ven >= '{data_inicio}'"
        filtros_vendas_rec += f" AND Data_VRec >= '{data_inicio}'"
    
    if data_fim:
        filtros_vendas += f" AND Data_Ven <= '{data_fim}'"
        filtros_vendas_rec += f" AND Data_VRec <= '{data_fim}'"
        
    print(f"DEBUG SQL: {filtros_vendas}")

    # Busca Nome Real do Empreendimento
    try:
        nome_obra_df = pd.read_sql("SELECT Descr_Obr FROM Obras WITH(NOLOCK) WHERE Empresa_Obr = ? AND Cod_Obr = ?", conn, params=[empresa, obra])
        nome_empreendimento = str(nome_obra_df['Descr_Obr'].iloc[0]).strip() if not nome_obra_df.empty else f"Obra {obra}"
    except Exception:
        nome_empreendimento = f"Obra {obra}"

    query_vendas = f"""
    SELECT 
        v.Num_Ven AS venda,
        v.Cliente_Ven AS clienteId,
        p_cli.nome_pes AS cliente_nome,
        p_cli.cpf_pes AS cliente_cpf,
        ISNULL(tel.fone_1, '') AS cliente_fone_1,
        ISNULL(tel.fone_2, '') AS cliente_fone_2,
        '' AS cliente_email,
        FORMAT(p_cli.dtnasc_pes, 'yyyy-MM-dd') AS cliente_nascimento,
        pe.Endereco_pend AS cliente_endereco,
        pe.Bairro_pend AS cliente_bairro,
        pe.Cidade_pend AS cliente_cidade,
        v.Vendedor_Ven AS corretorId,
        UPPER(p_cor.nome_pes) AS corretor_nome,
        ISNULL(UPPER(p_ger.nome_pes), 'SEM GERENTE/DIRETO') AS gerente_nome,
        FORMAT(v.Data_Ven, 'yyyy-MM-dd') AS dataVenda,
        (v.ValorTot_Ven + v.Acrescimo_Ven - v.Desconto_Ven) AS valorTotal,
        ISNULL(u.C1_unid, '') AS quadra,
        ISNULL(u.C2_unid, '') AS lote,
        v.Status_Ven AS statusCodigo,
        CASE 
            WHEN v.Status_Ven = 0 THEN 'Normal'
            WHEN v.Status_Ven = 1 AND vh.NumNovaVend_vhist IS NOT NULL THEN 'Cessão'
            WHEN v.Status_Ven = 1 THEN 'Cancelada'
            WHEN v.Status_Ven = 3 THEN 'Quitada'
            WHEN v.Status_Ven = 4 THEN 'Adiantado'
            ELSE 'Outro'
        END AS statusVenda,
        vh.NumNovaVend_vhist AS novaVendaTransferencia
    FROM (
        SELECT Empresa_Ven, Obra_Ven, Num_Ven, Cliente_Ven, Vendedor_Ven, Data_Ven, ValorTot_Ven, Acrescimo_Ven, Desconto_Ven, Status_Ven
        FROM Vendas WITH(NOLOCK)
        WHERE {filtros_vendas}
        UNION
        SELECT Empresa_VRec, Obra_VRec, Num_VRec, Cliente_VRec, Vendedor_VRec, Data_VRec, ValorTot_VRec, Acrescimo_VRec, Desconto_VRec, Status_VRec
        FROM VendasRecebidas WITH(NOLOCK)
        WHERE {filtros_vendas_rec}
    ) v
    INNER JOIN Pessoas p_cli WITH(NOLOCK) ON v.Cliente_Ven = p_cli.cod_pes
    LEFT JOIN PesEndereco pe WITH(NOLOCK) ON p_cli.cod_pes = pe.CodPes_pend AND pe.Tipo_pend = 0
    LEFT JOIN Pessoas p_cor WITH(NOLOCK) ON v.Vendedor_Ven = p_cor.cod_pes
    LEFT JOIN (SELECT CodPes_hqi, MIN(CodPesSuper_hqi) AS CodPesSuper_hqi FROM HierarquiaIntegrante WITH(NOLOCK) GROUP BY CodPes_hqi) hi ON v.Vendedor_Ven = hi.CodPes_hqi
    LEFT JOIN Pessoas p_ger WITH(NOLOCK) ON hi.CodPesSuper_hqi = p_ger.cod_pes
    LEFT JOIN VendaHist vh WITH(NOLOCK) ON vh.Empresa_vhist = v.Empresa_Ven AND vh.Obra_vhist = v.Obra_Ven AND vh.NumVend_vhist = v.Num_Ven AND vh.TipoMnt_vhist IN (2,8)
    OUTER APPLY (
        SELECT TOP 1 CONCAT(ddd_tel, fone_tel) AS fone_1, CONCAT(ddd_tel, fone_tel) AS fone_2  
        FROM PesTel WITH(NOLOCK) 
        WHERE pes_tel = v.Cliente_Ven 
        ORDER BY Principal_tel DESC
    ) tel
    OUTER APPLY (
        SELECT TOP 1 itv.Empresa_itv, itv.Obra_Itv, itv.NumVend_Itv, un.C1_unid, un.C2_unid 
        FROM ItensVenda itv WITH(NOLOCK)
        INNER JOIN UnidadePer un WITH(NOLOCK) ON itv.Empresa_itv = un.Empresa_unid AND itv.Produto_Itv = un.Prod_unid AND itv.CodPerson_Itv = un.NumPer_unid
        WHERE v.Empresa_Ven = itv.Empresa_itv AND v.Obra_Ven = itv.Obra_Itv AND v.Num_Ven = itv.NumVend_Itv
    ) u
    ORDER BY v.Data_Ven DESC
    """
    query_sinais_abertos = f"""
    SELECT 
        cr.NumVend_prc as venda,
        cr.NumParc_Prc as parcela,
        cr.Valor_Prc as valor_aberto,
        FORMAT(cr.Data_Prc, 'yyyy-MM-dd') as data_vencimento,
        CASE WHEN cr.Data_Prc < CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END as is_atrasado,
        CASE WHEN cr.Data_Prc < CAST(GETDATE() AS DATE) THEN cr.Valor_Prc ELSE 0 END as valor_atraso,
        cr.Tipo_Prc as tipo
    FROM ContasReceber cr WITH(NOLOCK)
    WHERE cr.Empresa_prc = {empresa} AND cr.Obra_Prc = '{obra}' AND cr.Status_Prc = 0
    ORDER BY cr.Data_Prc ASC
    """
    
    query_sinais_pagos = f"""
    SELECT 
        r.NumVend_Rec as venda,
        r.NumParc_Rec as parcela,
        (r.Valor_Rec + r.ValorConf_Rec) as valor_pago,
        FORMAT(r.Data_Rec, 'yyyy-MM-dd') as data_pagamento,
        FORMAT(r.DataVenci_Rec, 'yyyy-MM-dd') as data_vencimento,
        r.Tipo_Rec as tipo
    FROM Recebidas r WITH(NOLOCK)
    WHERE r.Empresa_rec = {empresa} AND r.Obra_Rec = '{obra}'
    ORDER BY r.Data_Rec DESC
    """

    query_condicao_financiamento = f"""
    SELECT 
        cr.NumVend_prc as venda,
        COUNT(cr.NumParc_Prc) as totalParcelasFinanciamento,
        SUM(CASE WHEN cr.Status_Prc = 1 THEN cr.Valor_Prc ELSE 0 END) as valorPagoFinanciamento,
        SUM(CASE WHEN cr.Status_Prc = 0 THEN cr.Valor_Prc ELSE 0 END) as saldoDevedorFinanciamento,
        SUM(CASE WHEN cr.Status_Prc = 0 AND cr.Data_Prc < CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) as parcelasAtrasadasFinanciamento,
        SUM(CASE WHEN cr.Status_Prc = 0 AND cr.Data_Prc < CAST(GETDATE() AS DATE) THEN cr.Valor_Prc ELSE 0 END) as valorAtrasadoFinanciamento
    FROM ContasReceber cr WITH(NOLOCK)
    WHERE cr.Empresa_prc = {empresa} AND cr.Obra_Prc = '{obra}' AND cr.Tipo_Prc != 'S'
    GROUP BY cr.NumVend_prc
    """

    query_prorrogacoes = f"""
    SELECT 
        cr.NumVend_prc as venda,
        SUM(CASE WHEN cr.DataPror_Prc IS NOT NULL AND cr.DataPror_Prc > cr.Data_Prc THEN 1 ELSE 0 END) as qtdProrrogacoes,
        MAX(CASE WHEN cr.DataPror_Prc IS NOT NULL AND cr.DataPror_Prc > cr.Data_Prc THEN FORMAT(cr.DataPror_Prc, 'yyyy-MM-dd') ELSE NULL END) as ultimaProrrogacao
    FROM ContasReceber cr WITH(NOLOCK)
    WHERE cr.Empresa_prc = {empresa} AND cr.Obra_Prc = '{obra}'
    GROUP BY cr.NumVend_prc
    """

    import warnings
    warnings.filterwarnings('ignore', category=UserWarning)# Ignore Pandas SQLAlchemy explicit warning 
    vendas_df = pd.read_sql(query_vendas, conn).fillna(0)
    sinais_abertos_df = pd.read_sql(query_sinais_abertos, conn).fillna(0)
    sinais_pagos_df = pd.read_sql(query_sinais_pagos, conn).fillna(0)
    condicoes_df = pd.read_sql(query_condicao_financiamento, conn).fillna(0)
    prorrogacoes_df = pd.read_sql(query_prorrogacoes, conn).fillna(0)

    if vendas_df.empty:
        return []

    vendas_df.drop_duplicates(subset=['venda'], keep='first', inplace=True)

    sinais_abertos_map = {}
    if not sinais_abertos_df.empty:
        for venda, group in sinais_abertos_df.groupby('venda'):
            parcelas_lista = group.to_dict('records')
            qtd_aberto = len(parcelas_lista)
            valor_aberto = group['valor_aberto'].sum()
            qtd_atraso = group['is_atrasado'].sum()
            valor_atraso = group['valor_atraso'].sum()
            
            # Extract proximoVencimento and max atraso (safe fallback to 0)
            proximo_venc = None
            if not group['data_vencimento'].dropna().empty:
                proximo_venc = group['data_vencimento'].min()

            # dias_atraso calculated safely against today
            hoje_dt = pd.Timestamp.now().normalize()
            atrasos = []
            for dt_str in group['data_vencimento'].dropna():
                try:
                    dt = pd.to_datetime(dt_str)
                    if dt < hoje_dt:
                        atrasos.append((hoje_dt - dt).days)
                except:
                    pass
            dias_atraso = max(atrasos) if atrasos else 0

            sinais_abertos_map[int(venda)] = {
                'qtdAberto': qtd_aberto,
                'valorAberto': valor_aberto,
                'qtdAtraso': qtd_atraso,
                'valorAtraso': valor_atraso,
                'proximoVencimento': proximo_venc,
                'diasAtraso': dias_atraso,
                'lista': parcelas_lista
            }
            
    sinais_pagos_map = {}
    if not sinais_pagos_df.empty:
        for venda, group in sinais_pagos_df.groupby('venda'):
            parcelas_lista_full = group.to_dict('records')
            qtd_pago = len(parcelas_lista_full)
            valor_pago = group['valor_pago'].sum()
            
            ultima_data_pag = None
            if not group['data_pagamento'].dropna().empty:
                ultima_data_pag = group['data_pagamento'].max()

            # Limitar a lista detalhada a 15 parcelas mais recentes para reduzir payload
            parcelas_lista = parcelas_lista_full[:15]

            sinais_pagos_map[int(venda)] = {
                'qtdPago': qtd_pago,
                'valorPago': valor_pago,
                'ultimaDataPagamento': ultima_data_pag,
                'lista': parcelas_lista
            }
    condicao_map = condicoes_df.set_index('venda').to_dict('index') if not condicoes_df.empty else {}
    prorrogacoes_map = prorrogacoes_df.set_index('venda').to_dict('index') if not prorrogacoes_df.empty else {}

    corretores_dict = {}
    current_month = datetime.now().strftime('%Y-%m')
    # Use fillna with specific values if needed, but the global fillna(0) above should cover most numeric issues
    vendas_df.replace({pd.NA: None, float('nan'): 0}, inplace=True)

    for _, row in vendas_df.iterrows():
        cod_corretor = row.get('corretorId')
        if pd.isna(cod_corretor) or not cod_corretor:
            cod_corretor = 0
        else:
            try:
                cod_corretor = int(float(cod_corretor))
            except (ValueError, TypeError):
                cod_corretor = 0
            
        if cod_corretor not in corretores_dict:
            corretores_dict[cod_corretor] = {
                "codigo_corretor": int(cod_corretor),
                "corretor": str(row.get('corretor_nome', 'SEM NOME')).strip(),
                "diretoria_equipe": str(row.get('gerente_nome', 'SEM DIRETORIA')).strip(),
                "empreendimento": nome_empreendimento,
                "resumo": {
                    "vendas_mes_atual": 0,
                    "vendas_total_obra": 0,
                    "vgv_total": 0.0
                },
                "vendas_detalhadas": []
            }

        data_venda = row.get('dataVenda')
        is_current_month = False
        if data_venda and data_venda.startswith(current_month):
            is_current_month = True

        valor_venda = float(row.get('valorTotal', 0))

        if row.get('statusCodigo') in [0, 3]: # Apenas normais ou quitadas p/ VGV
            corretores_dict[cod_corretor]['resumo']['vendas_total_obra'] += 1
            corretores_dict[cod_corretor]['resumo']['vgv_total'] += valor_venda
            if is_current_month:
                corretores_dict[cod_corretor]['resumo']['vendas_mes_atual'] += 1

        venda_id = row.get('venda')
        if pd.isna(venda_id) or not venda_id:
            continue # Venda sem ID não pode ser processada
        venda_id = int(float(venda_id))
        
        aberto = sinais_abertos_map.get(venda_id, {'qtdAberto': 0, 'valorAberto': 0, 'qtdAtraso': 0, 'valorAtraso': 0, 'proximoVencimento': None, 'diasAtraso': 0})
        pago = sinais_pagos_map.get(venda_id, {'qtdPago': 0, 'valorPago': 0, 'ultimaDataPagamento': None})
        condicao = condicao_map.get(venda_id, {'totalParcelasFinanciamento': 0, 'valorPagoFinanciamento': 0, 'saldoDevedorFinanciamento': 0, 'parcelasAtrasadasFinanciamento': 0, 'valorAtrasadoFinanciamento': 0})
        prorrog = prorrogacoes_map.get(venda_id, {'qtdProrrogacoes': 0, 'ultimaProrrogacao': None})

        sinal_situacao = "Sem Sinais"
        if aberto['qtdAtraso'] > 0: sinal_situacao = "Em Atraso"
        elif aberto['qtdAberto'] == 0 and pago['qtdPago'] > 0: sinal_situacao = "Sinais Pagos na Íntegra"
        elif aberto['qtdAberto'] > 0 and pago['qtdPago'] > 0: sinal_situacao = "Parcialmente Pago"
        elif aberto['qtdAberto'] > 0 and pago['qtdPago'] == 0: sinal_situacao = "Aguardando Pagamento"

        telefone_cli = str(row.get('cliente_fone_2') or row.get('cliente_fone_1') or '').strip()
        condicao_prazo = "À Vista" if condicao['totalParcelasFinanciamento'] == 0 else f"Financiado em {int(condicao['totalParcelasFinanciamento'])}x"

        end_rua = str(row.get('cliente_endereco', '')).strip()
        end_bai = str(row.get('cliente_bairro', '')).strip()
        end_cid = str(row.get('cliente_cidade', '')).strip()
        endereco_completo = f"{end_rua}, {end_bai} - {end_cid}".strip(', -')

        venda_detalhe = {
            "venda_id": int(venda_id),
            "quadra": str(row.get('quadra', '')).strip(),
            "lote": str(row.get('lote', '')).strip(),
            "data_venda": data_venda,
            "status_venda": row.get('statusVenda', ''),
            "valor_venda": valor_venda,
            "condicao_pagamento": condicao_prazo,
            "progresso_financiamento": {
                "total_parcelas_pos_sinal": int(condicao['totalParcelasFinanciamento']),
                "saldo_devedor_atual": float(condicao['saldoDevedorFinanciamento']),
                "valor_total_amortizado": float(condicao['valorPagoFinanciamento']),
                "parcelas_em_atraso": int(condicao['parcelasAtrasadasFinanciamento']),
                "valor_em_atraso": float(condicao['valorAtrasadoFinanciamento']),
                "alerta_risco_distrato": bool(condicao['parcelasAtrasadasFinanciamento'] > 0),
                "houve_prorrogacao": bool(prorrog['qtdProrrogacoes'] > 0),
                "total_prorrogacoes": int(prorrog['qtdProrrogacoes']),
                "data_ultima_prorrogacao": prorrog['ultimaProrrogacao']
            },
            "cliente": {
                "nome": str(row.get('cliente_nome', '')).strip(),
                "cpf": str(row.get('cliente_cpf', '')).strip(),
                "data_nascimento": str(row.get('cliente_nascimento', '')).strip() if row.get('cliente_nascimento') else None,
                "telefone": telefone_cli,
                "email": str(row.get('cliente_email', '')).strip(),
                "endereco": endereco_completo
            },
            "sinal_negocio": {
                "situacao": sinal_situacao,
                "sinais_totais": int(pago['qtdPago']) + int(aberto['qtdAberto']),
                "valor_total_sinal": float(pago['valorPago']) + float(aberto['valorAberto']),
                "sinais_pagos": int(pago['qtdPago']),
                "valor_ja_pago": float(pago['valorPago']),
                "data_ultimo_pagamento": pago['ultimaDataPagamento'],
                "valor_em_atraso": float(aberto['valorAtraso']),
                "dias_em_atraso_max": int(aberto['diasAtraso']),
                "data_proximo_vencimento": aberto['proximoVencimento']
            },
            "raw_sinais_abertos": {
                "lista": aberto.get('lista', [])
            },
            "raw_sinais_pagos": {
                "lista": pago.get('lista', [])
            }
        }
        
        # Dados da Cessão (sinais do sucessor)
        venda_detalhe['cessao'] = None
        nova_vid = row.get('novaVendaTransferencia')
        if pd.notna(nova_vid) and str(nova_vid).strip() != '0' and str(nova_vid).strip() != '':
            try:
                nova_vid_int = int(float(nova_vid))
                transf_aberto = sinais_abertos_map.get(nova_vid_int, {'qtdAberto': 0, 'valorAberto': 0, 'qtdAtraso': 0, 'valorAtraso': 0, 'diasAtraso': 0, 'proximoVencimento': None})
                transf_pago = sinais_pagos_map.get(nova_vid_int, {'qtdPago': 0, 'valorPago': 0})
                
                sinal_situacao_novo = "Sem Sinais"
                if transf_aberto['qtdAtraso'] > 0: sinal_situacao_novo = "Em Atraso"
                elif transf_aberto['qtdAberto'] == 0 and transf_pago['qtdPago'] > 0: sinal_situacao_novo = "Sinais Pagos na Íntegra"
                elif transf_aberto['qtdAberto'] > 0 and transf_pago['qtdPago'] > 0: sinal_situacao_novo = "Parcialmente Pago"
                elif transf_aberto['qtdAberto'] > 0 and transf_pago['qtdPago'] == 0: sinal_situacao_novo = "Aguardando Pagamento"
                
                venda_detalhe['cessao'] = {
                    "vendaId": nova_vid_int,
                    "situacao": sinal_situacao_novo,
                    "sinaisAbertoQtd": int(transf_aberto['qtdAberto']),
                    "sinaisAbertoValor": float(transf_aberto['valorAberto']),
                    "sinaisPagoQtd": int(transf_pago['qtdPago']),
                    "sinaisPagoValor": float(transf_pago['valorPago']),
                    "valorAtraso": float(transf_aberto.get('valorAtraso', 0)),
                    "diasAtraso": int(transf_aberto.get('diasAtraso', 0))
                }
            except (ValueError, TypeError):
                pass # Ignora cessão se ID for inválido
        corretores_dict[cod_corretor]['vendas_detalhadas'].append(venda_detalhe)

    return list(corretores_dict.values())

@router.get("/integracao/config/obras")
async def listar_obras_uau():
    """
    Retorna a lista de todas as obras (empreendimentos) ativas para o seletor no Frontend.
    """
    # Mapeamento real extraído da tabela de Vendas do UAU (Substitui os códigos fictícios 600-625)
    query = """
    SELECT Empresa_Obr AS empresa, Cod_Obr AS obra, UPPER(Descr_Obr) AS nome 
    FROM Obras WITH(NOLOCK) 
    WHERE (Empresa_Obr = 13 AND Cod_Obr = '70100') /* Dom Eliseu */
       OR (Empresa_Obr = 12 AND Cod_Obr = '70100') /* Capanema (Jardim America) */
       OR (Empresa_Obr = 12 AND Cod_Obr = '70101') /* Capanema II */
       OR (Empresa_Obr = 9 AND Cod_Obr = '70100')  /* Salles Jardim I */
       OR (Empresa_Obr = 9 AND Cod_Obr = '70101')  /* Salles Jardim II */
       OR (Empresa_Obr = 9 AND Cod_Obr = '70102')  /* Salles Jardim III */
       OR (Empresa_Obr = 9 AND Cod_Obr = '70103')  /* Salles Jardim IV */
       OR (Empresa_Obr = 6 AND Cod_Obr = '70100')  /* Jardim Castanhal I */
       OR (Empresa_Obr = 6 AND Cod_Obr = '70101')  /* Jardim Castanhal II */
       OR (Empresa_Obr = 24 AND Cod_Obr = '70100') /* Jardim Castanhal III */
       OR (Empresa_Obr = 6 AND Cod_Obr = '70400')  /* Valle do Ipitinga */
       OR (Empresa_Obr = 28 AND Cod_Obr = '70100') /* Valle do Ipitinga II */
       OR (Empresa_Obr = 6 AND Cod_Obr = '70300')  /* Tailandia I */
       OR (Empresa_Obr = 22 AND Cod_Obr = '70100') /* Tailandia II */
       OR (Empresa_Obr = 15 AND Cod_Obr = '70100') /* Barcarena */
       OR (Empresa_Obr = 983 AND Cod_Obr = '70100') /* Paragominas Uraim */
       OR (Empresa_Obr = 6 AND Cod_Obr = '70500')  /* Rondon Parque do Valle */
       OR (Empresa_Obr = 29 AND Cod_Obr = '70100') /* Valle dos Ipes Tomé-Açu */
    ORDER BY Descr_Obr
    """
    try:
        with get_db_connection() as conn:
            df = pd.read_sql(query, conn)
            # Limpa espaços das strings
            df['nome'] = df['nome'].apply(lambda x: str(x).strip() if pd.notnull(x) else x)

            obras = df.to_dict('records')
            return {"total": len(obras), "obras": obras}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao listar obras: {str(e)}")

@router.get("/integracao/corretores")
async def obter_dados_integracao_corretores(
    empresa: int = Query(28, description="Código da empresa (ex: 28)"),
    obra: str = Query("70100", description="Código da obra (ex: 70100)"),
    corretor_id: Optional[int] = Query(None, description="Filtrar por ID do Corretor"),
    data_inicio: Optional[str] = Query(None, description="Data Inicial (AAAA-MM-DD)"),
    data_fim: Optional[str] = Query(None, description="Data Final (AAAA-MM-DD)"),
    mes: Optional[str] = Query(None, description="Atalho para filtrar um mês específico (AAAA-MM)"),
    api_key: Optional[str] = Query(None, description="Chave de Acesso para segurança do Endpoint")
):
    """
    Exportação completa dos Corretores.
    Contém Módulos CRM, Financiamento, Extensão de Prazos e Metas/VGV.
    """
    # Exemplo de bloqueio simples caso queira habilitar (comentado a pedido)
    # if api_key != "MINHA_SENHA_FORTE_123": raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        with get_db_connection() as conn:
            active_mes = mes or datetime.now().strftime('%Y-%m')
            payload = fetch_dados_corretores(
                conn=conn, 
                empresa=empresa, 
                obra=obra,
                corretor_id=corretor_id,
                data_inicio=data_inicio,
                data_fim=data_fim,
                mes=active_mes
            )
            atualizado_em = datetime.now().isoformat()
            # Salva no cache Supabase para uso offline
            salvar_cache(empresa, obra, active_mes, payload)
            return {
                "total_corretores": len(payload),
                "dados": payload,
                "atualizado_em": atualizado_em,
                "is_cache": False
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro interno ao processar dados: {str(e)}")

@router.get("/integracao/cache/corretores")
async def buscar_dados_cache(
    empresa: int = Query(28),
    obra: str = Query("70100"),
    mes: Optional[str] = Query(None)
):
    """
    Endpoint de fallback: retorna dados em cache do Supabase.
    Usado pelo frontend quando o servidor local (túnel Cloudflare) está offline.
    """
    active_mes = mes or datetime.now().strftime('%Y-%m')
    cached = buscar_cache(empresa, obra, active_mes)
    if cached:
        return {
            "total_corretores": len(cached['dados']),
            "dados": cached['dados'],
            "atualizado_em": cached['atualizado_em'],
            "is_cache": True
        }
    raise HTTPException(status_code=404, detail="Nenhum cache encontrado para esse período.")
