import os
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import pyodbc
import urllib.parse
from datetime import datetime
from typing import List, Optional
from dotenv import load_dotenv

# ==========================================
# CONFIGURAÇÕES
# ==========================================
load_dotenv()

# --- Configurações UAU (Local SQL Server) ---
DB_SERVER = os.environ.get('UAU_DB_SERVER', r'DCWBD11\VALLEPRIME_PRD')
DB_NAME = os.environ.get('UAU_DB_NAME', 'UAU-VALLEPRIME')
DB_USER = os.environ.get('UAU_DB_USER', 'consultasBD')
DB_PASS = os.environ.get('UAU_DB_PASS', 'V@lle#2021')

# ==========================================
# INICIALIZANDO API
# ==========================================
app = FastAPI(
    title="Ponte REST Local - UAU Database",
    description="API que serve como ponte direta entre o servidor UAU na rede local e o sistema online.",
    version="1.0"
)

# CORS: Permitir acesso do seu sistema online (Front-end ou Backend remoto)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Sugestão: Alterar para a URL do seu site em produção para maior segurança
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# FUNÇÕES DE BANCO DE DADOS
# ==========================================
def conectar_uau():
    try:
        conn_str = (
            "Driver={SQL Server};"
            f"Server={DB_SERVER};"
            f"Database={DB_NAME};"
            f"UID={DB_USER};"
            f"PWD={DB_PASS};"
        )
        return pyodbc.connect(conn_str)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao conectar no banco UAU: {str(e)}")

def extrair_dados_corretores_uau(conn, empresa, obra, data_inicio=None, data_fim=None):
    """
    Função que bate no banco UAU e constrói o JSON inteiro de corretor.
    Mantém fielmente todo o cálculo de atrasos, prorrogações e VGV.
    Aceita filtros de período via data_inicio e data_fim (formato YYYY-MM-DD).
    """
    filtros_vendas = f"Empresa_Ven = {empresa} AND Obra_Ven = '{obra}' AND TipoVenda_Ven IN (0,1,2,3,4,5)"
    filtros_vendas_rec = f"Empresa_VRec = {empresa} AND Obra_VRec = '{obra}' AND TipoVenda_VRec IN (0,1,2,3,4,5)"
    
    if data_inicio:
        data_inicio_sql = data_inicio.replace("-", "")
        filtros_vendas += f" AND Data_Ven >= '{data_inicio_sql}'"
        filtros_vendas_rec += f" AND Data_VRec >= '{data_inicio_sql}'"
        
    if data_fim:
        data_fim_sql = data_fim.replace("-", "")
        filtros_vendas += f" AND Data_Ven <= '{data_fim_sql}'"
        filtros_vendas_rec += f" AND Data_VRec <= '{data_fim_sql}'"
    
    try:
        nome_obra_df = pd.read_sql("SELECT Descr_Obr FROM Obras WITH(NOLOCK) WHERE Empresa_Obr = ? AND Cod_Obr = ?", conn, params=[empresa, obra])
        nome_empreendimento = str(nome_obra_df['Descr_Obr'].iloc[0]).strip() if not nome_obra_df.empty else f"Obra {obra}"
    except:
        nome_empreendimento = f"Obra {obra}"
        
    query_vendas = f"""
    SELECT 
        v.Num_Ven AS venda, v.Cliente_Ven AS clienteId, p_cli.nome_pes AS cliente_nome, p_cli.cpf_pes AS cliente_cpf,
        ISNULL(tel.fone_1, '') AS cliente_fone_1, ISNULL(tel.fone_2, '') AS cliente_fone_2,
        '' AS cliente_email, FORMAT(p_cli.dtnasc_pes, 'yyyy-MM-dd') AS cliente_nascimento,
        pe.Endereco_pend AS cliente_endereco, pe.Bairro_pend AS cliente_bairro, pe.Cidade_pend AS cliente_cidade,
        v.Vendedor_Ven AS corretorId, UPPER(p_cor.nome_pes) AS corretor_nome,
        ISNULL(UPPER(p_ger.nome_pes), 'SEM GERENTE/DIRETO') AS gerente_nome,
        FORMAT(v.Data_Ven, 'yyyy-MM-dd') AS dataVenda,
        (v.ValorTot_Ven + v.Acrescimo_Ven - v.Desconto_Ven) AS valorTotal,
        ISNULL(u.C1_unid, '') AS quadra, ISNULL(u.C2_unid, '') AS lote,
        v.Status_Ven AS statusCodigo,
        CASE 
            WHEN v.Status_Ven = 0 THEN 'Normal' WHEN v.Status_Ven = 1 AND vh.NumNovaVend_vhist IS NOT NULL THEN 'Cessão'
            WHEN v.Status_Ven = 1 THEN 'Cancelada' WHEN v.Status_Ven = 3 THEN 'Quitada'
            WHEN v.Status_Ven = 4 THEN 'Adiantado' ELSE 'Outro'
        END AS statusVenda, vh.NumNovaVend_vhist AS novaVendaTransferencia
    FROM (
        SELECT Empresa_Ven, Obra_Ven, Num_Ven, Cliente_Ven, Vendedor_Ven, Data_Ven, ValorTot_Ven, Acrescimo_Ven, Desconto_Ven, Status_Ven
        FROM Vendas WITH(NOLOCK) WHERE {filtros_vendas}
        UNION
        SELECT Empresa_VRec, Obra_VRec, Num_VRec, Cliente_VRec, Vendedor_VRec, Data_VRec, ValorTot_VRec, Acrescimo_VRec, Desconto_VRec, Status_VRec
        FROM VendasRecebidas WITH(NOLOCK) WHERE {filtros_vendas_rec}
    ) v
    INNER JOIN Pessoas p_cli WITH(NOLOCK) ON v.Cliente_Ven = p_cli.cod_pes
    LEFT JOIN PesEndereco pe WITH(NOLOCK) ON p_cli.cod_pes = pe.CodPes_pend AND pe.Tipo_pend = 0
    LEFT JOIN Pessoas p_cor WITH(NOLOCK) ON v.Vendedor_Ven = p_cor.cod_pes
    LEFT JOIN (SELECT CodPes_hqi, MIN(CodPesSuper_hqi) AS CodPesSuper_hqi FROM HierarquiaIntegrante WITH(NOLOCK) GROUP BY CodPes_hqi) hi ON v.Vendedor_Ven = hi.CodPes_hqi
    LEFT JOIN Pessoas p_ger WITH(NOLOCK) ON hi.CodPesSuper_hqi = p_ger.cod_pes
    LEFT JOIN VendaHist vh WITH(NOLOCK) ON vh.Empresa_vhist = v.Empresa_Ven AND vh.Obra_vhist = v.Obra_Ven AND vh.NumVend_vhist = v.Num_Ven AND vh.TipoMnt_vhist IN (2,8)
    OUTER APPLY (SELECT TOP 1 CONCAT(ddd_tel, fone_tel) AS fone_1, CONCAT(ddd_tel, fone_tel) AS fone_2  FROM PesTel WITH(NOLOCK) WHERE pes_tel = v.Cliente_Ven ORDER BY Principal_tel DESC) tel
    OUTER APPLY (SELECT TOP 1 itv.Empresa_itv, itv.Obra_Itv, itv.NumVend_Itv, un.C1_unid, un.C2_unid FROM ItensVenda itv WITH(NOLOCK) INNER JOIN UnidadePer un WITH(NOLOCK) ON itv.Empresa_itv = un.Empresa_unid AND itv.Produto_Itv = un.Prod_unid AND itv.CodPerson_Itv = un.NumPer_unid WHERE v.Empresa_Ven = itv.Empresa_itv AND v.Obra_Ven = itv.Obra_Itv AND v.Num_Ven = itv.NumVend_Itv) u
    """
    
    query_sinais_abertos = f"SELECT cr.NumVend_prc as venda, cr.NumParc_Prc as parcela, cr.Valor_Prc as valor_aberto, FORMAT(cr.Data_Prc, 'yyyy-MM-dd') as data_vencimento, CASE WHEN cr.Data_Prc < CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END as is_atrasado, CASE WHEN cr.Data_Prc < CAST(GETDATE() AS DATE) THEN cr.Valor_Prc ELSE 0 END as valor_atraso, cr.Tipo_Prc as tipo FROM ContasReceber cr WITH(NOLOCK) WHERE cr.Empresa_prc = {empresa} AND cr.Obra_Prc = '{obra}' AND cr.Status_Prc = 0 AND cr.Tipo_Prc = 'S'"
    query_sinais_pagos = f"SELECT r.NumVend_Rec as venda, r.NumParc_Rec as parcela, (r.Valor_Rec + r.ValorConf_Rec) as valor_pago, FORMAT(r.Data_Rec, 'yyyy-MM-dd') as data_pagamento, FORMAT(r.DataVenci_Rec, 'yyyy-MM-dd') as data_vencimento, r.Tipo_Rec as tipo FROM Recebidas r WITH(NOLOCK) WHERE r.Empresa_rec = {empresa} AND r.Obra_Rec = '{obra}' AND r.Tipo_Rec = 'S'"
    query_cond_fin = f"SELECT cr.NumVend_prc as venda, COUNT(cr.NumParc_Prc) as totalParcelasFinanciamento, SUM(CASE WHEN cr.Status_Prc = 1 THEN cr.Valor_Prc ELSE 0 END) as valorPagoFinanciamento, SUM(CASE WHEN cr.Status_Prc = 0 THEN cr.Valor_Prc ELSE 0 END) as saldoDevedorFinanciamento, SUM(CASE WHEN cr.Status_Prc = 0 AND cr.Data_Prc < CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) as parcelasAtrasadasFinanciamento, SUM(CASE WHEN cr.Status_Prc = 0 AND cr.Data_Prc < CAST(GETDATE() AS DATE) THEN cr.Valor_Prc ELSE 0 END) as valorAtrasadoFinanciamento FROM ContasReceber cr WITH(NOLOCK) WHERE cr.Empresa_prc = {empresa} AND cr.Obra_Prc = '{obra}' AND cr.Tipo_Prc = 'S' GROUP BY cr.NumVend_prc"
    query_prorrogacoes = f"SELECT cr.NumVend_prc as venda, SUM(CASE WHEN cr.DataPror_Prc IS NOT NULL AND cr.DataPror_Prc > cr.Data_Prc THEN 1 ELSE 0 END) as qtdProrrogacoes, MAX(CASE WHEN cr.DataPror_Prc IS NOT NULL AND cr.DataPror_Prc > cr.Data_Prc THEN FORMAT(cr.DataPror_Prc, 'yyyy-MM-dd') ELSE NULL END) as ultimaProrrogacao FROM ContasReceber cr WITH(NOLOCK) WHERE cr.Empresa_prc = {empresa} AND cr.Obra_Prc = '{obra}' AND cr.Tipo_Prc = 'S' GROUP BY cr.NumVend_prc"
    
    import warnings
    warnings.filterwarnings('ignore', category=UserWarning)
    
    vendas_df = pd.read_sql(query_vendas, conn).fillna(0)
    if vendas_df.empty: return []
    sinais_abertos_df = pd.read_sql(query_sinais_abertos, conn).fillna(0)
    sinais_pagos_df = pd.read_sql(query_sinais_pagos, conn).fillna(0)
    condicoes_df = pd.read_sql(query_cond_fin, conn).fillna(0)
    prorrog_df = pd.read_sql(query_prorrogacoes, conn).fillna(0)
    vendas_df.drop_duplicates(subset=['venda'], keep='first', inplace=True)
    
    # Processa Dicionários de Sinais/Atrasos
    abertos_map = {}
    if not sinais_abertos_df.empty:
        hoje_dt = pd.Timestamp.now().normalize()
        for v, g in sinais_abertos_df.groupby('venda'):
            proximo_venc = None
            if not g['data_vencimento'].dropna().empty: proximo_venc = g['data_vencimento'].min()
            
            atrasos = []
            for dt_str in g['data_vencimento'].dropna():
                try:
                    dt = pd.to_datetime(dt_str)
                    if dt < hoje_dt: atrasos.append((hoje_dt - dt).days)
                except: pass
            
            abertos_map[int(v)] = {
                'qtdAberto': len(g), 'valorAberto': g['valor_aberto'].sum(), 
                'qtdAtraso': g['is_atrasado'].sum(), 'valorAtraso': g['valor_atraso'].sum(),
                'proximoVencimento': proximo_venc, 'diasAtraso': max(atrasos) if atrasos else 0,
                'lista': g.to_dict('records')
            }

    pagos_map = {}
    if not sinais_pagos_df.empty:
        for v, g in sinais_pagos_df.groupby('venda'):
            ultima_data_pag = g['data_pagamento'].max() if not g['data_pagamento'].dropna().empty else None
            pagos_map[int(v)] = {
                'qtdPago': len(g), 'valorPago': g['valor_pago'].sum(), 'ultimaDataPagamento': ultima_data_pag,
                'lista': g.to_dict('records')[:15]
            }

    cond_map = condicoes_df.set_index('venda').to_dict('index') if not condicoes_df.empty else {}
    pr_map = prorrog_df.set_index('venda').to_dict('index') if not prorrog_df.empty else {}

    # Objeto Final dos Corretores
    corretores_dict = {}
    current_month = datetime.now().strftime('%Y-%m')
    vendas_df.replace({pd.NA: None, float('nan'): 0}, inplace=True)

        # Converte ID do corretor de forma segura
        try:
            cod_corretor = row.get('corretorId', 0)
            if pd.isna(cod_corretor) or not cod_corretor:
                cod_corretor = 0
            else:
                cod_corretor = int(float(cod_corretor))
        except:
            cod_corretor = 0

        if cod_corretor not in corretores_dict:
            corretores_dict[cod_corretor] = {
                "codigo_corretor": cod_corretor,
                "corretor": str(row.get('corretor_nome', 'SEM NOME')).strip(),
                "diretoria_equipe": str(row.get('gerente_nome', 'SEM DIRETORIA')).strip(),
                "empreendimento": nome_empreendimento,
                "resumo": {"vendas_mes_atual": 0, "vendas_total_obra": 0, "vgv_total": 0.0},
                "vendas_detalhadas": []
            }
            
        data_venda = row.get('dataVenda')
        valor_venda = float(row.get('valorTotal', 0))
        is_current_month = data_venda and data_venda.startswith(current_month)
        
        if row.get('statusCodigo') in [0, 3]:
            corretores_dict[cod_corretor]['resumo']['vendas_total_obra'] += 1
            corretores_dict[cod_corretor]['resumo']['vgv_total'] += valor_venda
            if is_current_month: corretores_dict[cod_corretor]['resumo']['vendas_mes_atual'] += 1
            
        # Converte ID da venda de forma segura
        try:
            venda_id = row.get('venda')
            if pd.isna(venda_id) or not venda_id:
                continue
            venda_id = int(float(venda_id))
        except:
            continue
        
        ab = abertos_map.get(venda_id, {'qtdAberto': 0, 'valorAberto': 0, 'qtdAtraso': 0, 'valorAtraso': 0, 'proximoVencimento': None, 'diasAtraso': 0, 'lista': []})
        pg = pagos_map.get(venda_id, {'qtdPago': 0, 'valorPago': 0, 'ultimaDataPagamento': None, 'lista': []})
        cd = cond_map.get(venda_id, {'totalParcelasFinanciamento': 0, 'valorPagoFinanciamento': 0, 'saldoDevedorFinanciamento': 0, 'parcelasAtrasadasFinanciamento': 0, 'valorAtrasadoFinanciamento': 0})
        pr = pr_map.get(venda_id, {'qtdProrrogacoes': 0, 'ultimaProrrogacao': None})
        
        sinal_sit = "Sem Sinais"
        if ab['qtdAtraso'] > 0: sinal_sit = "Em Atraso"
        elif ab['qtdAberto'] == 0 and pg['qtdPago'] > 0: sinal_sit = "Sinais Pagos na Íntegra"
        elif ab['qtdAberto'] > 0 and pg['qtdPago'] > 0: sinal_sit = "Parcialmente Pago"
        elif ab['qtdAberto'] > 0 and pg['qtdPago'] == 0: sinal_sit = "Aguardando Pagamento"
        
        end_rua = str(row.get('cliente_endereco', '')).strip()
        end_bai = str(row.get('cliente_bairro', '')).strip()
        end_cid = str(row.get('cliente_cidade', '')).strip()
        endereco_completo = f"{end_rua}, {end_bai} - {end_cid}".strip(', -')
        
        venda_detalhe = {
            "venda_id": venda_id,
            "quadra": str(row.get('quadra', '')).strip(),
            "lote": str(row.get('lote', '')).strip(),
            "data_venda": data_venda, 
            "status_venda": row.get('statusVenda', ''),
            "status_codigo": int(float(row.get('statusCodigo') if pd.notnull(row.get('statusCodigo')) else 0)),
            "valor_venda": valor_venda,
            "condicao_pagamento": "À Vista" if cd['totalParcelasFinanciamento'] == 0 else f"Financiado em {int(cd['totalParcelasFinanciamento'])}x",
            "progresso_financiamento": {
                "total_parcelas_pos_sinal": int(cd['totalParcelasFinanciamento']),
                "saldo_devedor_atual": float(cd['saldoDevedorFinanciamento']),
                "valor_total_amortizado": float(cd['valorPagoFinanciamento']),
                "parcelas_em_atraso": int(cd['parcelasAtrasadasFinanciamento']),
                "valor_em_atraso": float(cd['valorAtrasadoFinanciamento']),
                "alerta_risco_distrato": bool(cd['parcelasAtrasadasFinanciamento'] > 0),
                "houve_prorrogacao": bool(pr['qtdProrrogacoes'] > 0), 
                "total_prorrogacoes": int(pr['qtdProrrogacoes']), 
                "data_ultima_prorrogacao": pr['ultimaProrrogacao']
            },
            "cliente": {
                "nome": str(row.get('cliente_nome', '')).strip(), 
                "cpf": str(row.get('cliente_cpf', '')).strip(),
                "telefone": str(row.get('cliente_fone_2') or row.get('cliente_fone_1') or '').strip(),
                "endereco": endereco_completo
            },
            "sinal_negocio": {
                "situacao": sinal_sit, 
                "valor_total_sinal": float(pg['valorPago']) + float(ab['valorAberto']),
                "sinais_pagos": int(pg['qtdPago']), 
                "valor_ja_pago": float(pg['valorPago']),
                "data_ultimo_pagamento": pg['ultimaDataPagamento'], 
                "valor_em_atraso": float(ab['valorAtraso']),
                "dias_em_atraso_max": int(ab['diasAtraso']), 
                "data_proximo_vencimento": ab['proximoVencimento']
            },
            "raw_sinais_abertos": {"lista": ab['lista']}, 
            "raw_sinais_pagos": {"lista": pg['lista']}
        }
        corretores_dict[cod_corretor]['vendas_detalhadas'].append(venda_detalhe)
        
    return list(corretores_dict.values())

def extrair_disponibilidades_uau(conn, empresa: int, produto: int):
    """
    Função que bate no banco UAU e extrai a disponibilidade de unidades (lotes/aptos)
    com base no produto e empresa. Retorna dados comerciais, status, metragens e preço mínimo.
    """
    query = """
    SELECT * FROM(
        SELECT Anexos_unid,Prod_unid,Empresa_unid,NumPer_unid,Obra_unid,NumObe_unid,Cod_obe,FracaoIdeal_unid,FracaoIdealDecimal_unid,Identificador_unid,Qtde_unid,Codigo_unid,PorcentPr_Unid,Vendido_unid,TipoContrato_udt,NumCategStatus_unid,Desc_csup,CodTipProd_unid,Descricao_tipprod,ReterPrimAluguel_udt,PorcentComissao_unid,DataReconhecimentoReceitaMapa_unid,DataEntregaChaves_unid,DataCad_unid,UsrCad_unid,COALESCE(TipoUnidMultipropriedade_udt,0) AS TipoUnidMultipropriedade_udt,NumUnidFisica_udt,
        c1_unid,c2_unid,c3_unid,c4_unid,c5_unid,c6_unid,c7_unid,c8_unid,c9_unid,c10_unid,c11_unid,c12_unid,c13_unid,c14_unid,c15_unid,c16_unid,c17_unid,c18_unid,c19_unid,c20_unid,c21_unid,c22_unid,c23_unid,c24_unid,c25_unid, 
        CASE WHEN UnidadeDetalhe.TipoContrato_udt IN(1, 2, 4, 5) THEN UnidadePer.ValPreco_unid WHEN ((UnidadeDetalhe.TipoContrato_udt = 0 AND UnidadePer.Vendido_unid = 10) OR UnidadePer.UnidadeVendidaDacao_unid = 1) THEN UnidadePer.ValPreco_unid ELSE Round((UnidadePer.PorcentPr_Unid / 100 * TabValMin.Valor_cpp),2) END AS PrecoMin, 
        CASE WHEN UnidadeDetalhe.TipoContrato_udt IN(1, 2, 4, 5) THEN (UnidadePer.Qtde_Unid * UnidadePer.ValPreco_unid) WHEN ((UnidadeDetalhe.TipoContrato_udt = 0 AND UnidadePer.Vendido_unid = 10) OR UnidadePer.UnidadeVendidaDacao_unid = 1) THEN (UnidadePer.Qtde_Unid * UnidadePer.ValPreco_unid) ELSE (UnidadePer.Qtde_Unid * (Round(UnidadePer.PorcentPr_Unid / 100 * TabValMin.Valor_cpp,2))) END AS ValorTotal ,  
        CASE       
            WHEN UnidadePer.Vendido_unid = 0 THEN 'Disponível'       
            WHEN UnidadePer.Vendido_unid = 1 THEN CASE WHEN UnidadeDetalhe.TipoContrato_udt IN(1, 2, 5) THEN 'Locada' ELSE 'Vendida' END       
            WHEN UnidadePer.Vendido_unid = 2  THEN 'Reservado'       
            WHEN UnidadePer.Vendido_unid = 3  THEN 'Proposta'       
            WHEN UnidadePer.Vendido_unid = 4  THEN 'Quitado'       
            WHEN UnidadePer.Vendido_unid = 5  THEN 'Escriturado'       
            WHEN UnidadePer.Vendido_unid = 6  THEN 'Em venda'       
            WHEN UnidadePer.Vendido_unid = 7  THEN 'Suspenso'       
            WHEN UnidadePer.Vendido_unid = 8  THEN 'Fora de venda'       
            WHEN UnidadePer.Vendido_unid = 9  THEN 'Em acerto'       
            WHEN UnidadePer.Vendido_unid = 10 THEN 'Dação'   
        END AS Descr_status ,  
        CASE WHEN UnidadePer.UnidadeVendidaDacao_unid = 1 THEN 1 ELSE 0 END AS UnidadeVendidaDacao_unid , 
        ObjEspelhoTop_unid, ObjEspelhoLeft_unid, Usr_uo  
        FROM UnidadePer WITH(NOLOCK)  
        LEFT JOIN ObrUsr WITH(NOLOCK) ON Empresa_unid = Emp_uo AND Obra_unid = Obr_uo 
        LEFT JOIN(
            SELECT Empresa_cpp, Codigo_cpp, Valor_cpp, Data_cpp 
            FROM CategoriasPrecoProd WITH(NOLOCK) 
            WHERE (NumProd_cpp = ?) 
            AND EXISTS (
                SELECT Codigo_cpp FROM CategoriasPrecoProd AS CatPre 
                WHERE (CatPre.NumProd_cpp = ?) 
                AND (CatPre.Data_cpp <= CAST(GETDATE() AS DATE)) 
                AND CategoriasPrecoProd.Codigo_cpp = CatPre.Codigo_cpp AND CategoriasPrecoProd.Empresa_cpp = CatPre.Empresa_cpp 
                GROUP BY Codigo_cpp HAVING Max(Data_cpp) = CategoriasPrecoProd.Data_cpp
            )
        ) AS TabValMin ON UnidadePer.codigo_unid = TabValMin.codigo_cpp AND UnidadePer.Empresa_unid = TabValMin.Empresa_cpp 
        LEFT JOIN UnidadeDetalhe WITH(NOLOCK) ON UnidadePer.Empresa_unid = UnidadeDetalhe.Empresa_udt AND UnidadePer.Prod_unid = UnidadeDetalhe.Prod_udt AND UnidadePer.NumPer_unid = UnidadeDetalhe.NumPer_udt   
        LEFT JOIN ObraBlocoEtapa WITH(NOLOCK) ON ObraBlocoEtapa.Empresa_obe = UnidadePer.Empresa_unid AND ObraBlocoEtapa.Obra_obe = UnidadePer.Obra_unid AND ObraBlocoEtapa.Num_obe = UnidadePer.NumObe_unid  
        LEFT JOIN TipologiaProducao WITH(NOLOCK) ON TipologiaProducao.Codigo_tipprod = UnidadePer.CodTipProd_unid 
        LEFT JOIN CategoriaStatusUnidadePer WITH(NOLOCK) ON UnidadePer.NumCategStatus_unid = CategoriaStatusUnidadePer.Num_csup  
    ) AS TotalPerson 
    WHERE (Prod_unid = ?) AND (Empresa_Unid = ?) 
    ORDER BY NumPer_unid
    """
    
    import warnings
    warnings.filterwarnings('ignore', category=UserWarning)
    
    params = [produto, produto, produto, empresa]
    df = pd.read_sql(query, conn, params=params).fillna("")
    if df.empty:
        return []

    unidades = []
    for _, row in df.iterrows():
        quadra = str(row.get('c1_unid', '')).strip()
        lote = str(row.get('c2_unid', '')).strip()
        logradouro = str(row.get('c3_unid', '')).strip()
        
        unidade = {
            "unidade_id": row.get('NumPer_unid'),
            "codigo_unidade": row.get('Codigo_unid'),
            "identificador": str(row.get('Identificador_unid', '')).strip(),
            "status": str(row.get('Descr_status', '')).strip(),
            "quadra": quadra,
            "lote": lote,
            "logradouro": logradouro,
            "metragem": float(row.get('Qtde_unid', 0)) if row.get('Qtde_unid') else 0.0,
            "preco_minimo": float(row.get('PrecoMin', 0)) if row.get('PrecoMin') else 0.0,
            "valor_total": float(row.get('ValorTotal', 0)) if row.get('ValorTotal') else 0.0,
            "caracteristicas_extras": {
                f"c{i}": str(row.get(f"c{i}_unid", "")).strip() for i in range(1, 26)
            }
        }
        unidades.append(unidade)

    return unidades

# ==========================================
# ROTAS DA API
# ==========================================

@app.get("/")
def home():
    return {
        "status": "online", 
        "mensagem": "Ponte UAU Database está rodando na sua máquina!",
        "horario_servidor": datetime.now().isoformat()
    }

@app.get("/api/vendas/{empresa}/{obra}")
def consultar_vendas_obra(empresa: int, obra: str, user: Optional[str] = "Desconhecido", data_inicio: Optional[str] = None, data_fim: Optional[str] = None):
    """
    Link de Consulta em Tempo Real:
    O sistema online pode enviar requisições GET para cá e obter os dados atualizados 
    diretamente do banco UAU local da sua máquina.
    Aceita ?data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD
    """
    # Log de Auditoria
    now = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    periodo = f"{data_inicio or 'Inicio'} ate {data_fim or 'Hoje'}"
    print(f"\n[AUDITORIA] {now} | USUARIO: {user.upper()}")
    print(f"            CONSULTA: Performance Vendas | EMPRESA: {empresa} | OBRA: {obra}")
    print(f"            PERIODO:  {periodo}")
    
    try:
        conn = conectar_uau()
        dados = extrair_dados_corretores_uau(conn, empresa, obra, data_inicio, data_fim)
        conn.close()
        
        return {
            "sucesso": True,
            "empresa": empresa,
            "obra": obra,
            "total_corretores": len(dados),
            "data": dados,
            "atualizado_em": datetime.now().isoformat()
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/disponibilidades/{empresa}/{produto}")
def consultar_disponibilidades(empresa: int, produto: int, user: Optional[str] = "Desconhecido"):
    """
    Retorna o mapa de disponibilidades, status, preços e metragens 
    das unidades de uma obra/produto em tempo real.
    """
    # Log de Auditoria
    now = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    print(f"\n[AUDITORIA] {now} | USUARIO: {user.upper()}")
    print(f"            CONSULTA: Mapa Disponibilidades | EMPRESA: {empresa} | PRODUTO: {produto}")
    
    try:
        conn = conectar_uau()
        dados = extrair_disponibilidades_uau(conn, empresa, produto)
        conn.close()
        
        return {
            "sucesso": True,
            "empresa": empresa,
            "produto": produto,
            "total_unidades": len(dados),
            "data": dados,
            "atualizado_em": datetime.now().isoformat()
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ping")
def testar_conexao_banco():
    """
    Testa se o computador local consegue enxergar o UAU.
    """
    try:
        conn = conectar_uau()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        conn.close()
        return {"banco_conectado": True}
    except Exception as e:
        return {"banco_conectado": False, "erro": str(e)}

# ==========================================
# EXECUÇÃO DO SERVIDOR LOCAL
# ==========================================
if __name__ == "__main__":
    print("=========================================================")
    print("INICIANDO API PONTE - UAU DATABASE")
    print("=========================================================")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
