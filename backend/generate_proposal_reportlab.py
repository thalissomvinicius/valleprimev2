from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
import json
import os
import re

# Helper functions to format CPF, CNPJ, and CEP
def format_cpf(cpf):
    """Format CPF as 000.000.000-00"""
    if not cpf:
        return cpf
    # Remove any non-digit characters
    digits = re.sub(r'\D', '', str(cpf))
    if len(digits) == 11:
        return f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"
    return cpf  # Return original if not valid

def format_cnpj(cnpj):
    """Format CNPJ as 00.000.000/0000-00"""
    if not cnpj:
        return cnpj
    # Remove any non-digit characters
    digits = re.sub(r'\D', '', str(cnpj))
    if len(digits) == 14:
        return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}"
    return cnpj  # Return original if not valid

def format_cep(cep):
    """Format CEP as 00000-000"""
    if not cep:
        return cep
    # Remove any non-digit characters
    digits = re.sub(r'\D', '', str(cep))
    if len(digits) == 8:
        return f"{digits[:5]}-{digits[5:]}"
    return cep  # Return original if not valid

def format_cpf_cnpj(value):
    """Auto-detect and format CPF or CNPJ based on length"""
    if not value:
        return value
    digits = re.sub(r'\D', '', str(value))
    if len(digits) == 11:
        return format_cpf(value)
    elif len(digits) == 14:
        return format_cnpj(value)
    return value  # Return original if not valid


def generate_pdf_reportlab(data, background_image_path, positions_path, output_filename="proposta_final_output.pdf"):
    # Load positions
    with open(positions_path, 'r', encoding='utf-8') as f:
        positions = json.load(f)

    # Create canvas
    c = canvas.Canvas(output_filename, pagesize=A4)
    width, height = A4 # 210mm, 297mm approx (in points)
    
    # Draw background image
    c.drawImage(background_image_path, 0, 0, width=width, height=height)
    
    # Set default font
    c.setFont("Helvetica", 10) # Using 10pt as a starting guess
    
    # Define Column Groups for X-Alignment
    column_groups = {
        "qtd": [
            'sinal_l1_qtd_parcelas', 'sinal_l2_qtd_parcelas', 'sinal_bloco2_qtd_parcelas', 
            'entrada_qtd_parcelas', 'saldo_qtd_parcelas', 'saldo_l2_qtd_parcelas'
        ],
        "valor": [
            'sinal_l1_valor_parcela', 'sinal_l2_valor_parcela', 'sinal_bloco2_valor_parcela',
            'entrada_valor_parcela', 'saldo_valor_parcela', 'saldo_l2_valor_parcela'
        ],
        "dia": [
            'sinal_l1_dia', 'sinal_l2_dia', 'sinal_bloco2_dia',
            'entrada_dia', 'saldo_dia', 'saldo_l2_dia'
        ],
        "mes": [
            'sinal_l1_mes', 'sinal_l2_mes', 'sinal_bloco2_mes',
            'entrada_mes', 'saldo_mes', 'saldo_l2_mes'
        ],
        "ano": [
            'sinal_l1_ano', 'sinal_l2_ano', 'sinal_bloco2_ano',
            'entrada_ano', 'saldo_ano', 'saldo_l2_ano'
        ],
        "periodicidade": [
             'sinal_l1_periodicidade', 'sinal_l2_periodicidade', 'sinal_bloco2_periodicidade',
             'entrada_periodicidade', 'saldo_periodicidade', 'saldo_l2_periodicidade'
        ],
        "tipo": [
            'saldo_tipo_parcela', 'saldo_l2_tipo_parcela'
        ]
    }

    # Calculate unified X for each group (Average)
    group_x_map = {}
    for group_name, keys in column_groups.items():
        total_x = 0
        count = 0
        for k in keys:
             if k in positions:
                 total_x += positions[k]['x']
                 count += 1
        if count > 0:
            avg_x = total_x / count
            # Store the Unified X for each key in this group
            for k in keys:
                group_x_map[k] = avg_x

    # Helper: Draw text from Top-Left mm coordinates
    def draw_text(key, value):
        if key not in positions:
            print(f"Warning: Field '{key}' not found in positions.")
            return

        pos = positions[key]
        x_mm = pos['x']
        y_mm = pos['y']
        
        # Apply Column Alignment Override if applicable
        is_payment_col = False
        if key in group_x_map:
            x_mm = group_x_map[key]
            is_payment_col = True
        
        # Checkbox logic
        text_to_draw = str(value)
        if isinstance(value, bool):
            text_to_draw = "X" if value else ""
        
        # Apply CPF/CNPJ formatting
        cpf_cnpj_keys = ['cpf_cnpj_proponente', 'cpf_cnpj_segundo']
        if key in cpf_cnpj_keys and text_to_draw.strip() != "":
            text_to_draw = format_cpf_cnpj(text_to_draw)
        
        # Apply CEP formatting
        cep_keys = ['cep_proponente', 'cep_segundo']
        if key in cep_keys and text_to_draw.strip() != "":
            text_to_draw = format_cep(text_to_draw)
            
        # Add R$ prefix for Valid payment values
        currency_keys = column_groups["valor"] + ["valor_inicial", "valor_sinal", "sinal_bloco2_valor", "valor_total_entrada", "valor_saldo_parcelar"]
        if key in currency_keys and text_to_draw.strip() != "":
            text_to_draw = f"R$ {text_to_draw}"

        # Initialize overrides
        y_offset_correction = 0
        x_offset_correction = 0
        
        # --- Global offset ---
        # User asked to move TOP text slightly DOWN. Let's try 1.4.
        y_offset_correction = 1.4
        x_offset_correction = 0.0 # Global X Shift
        
        # --- Specific Adjustments ---

        # 1. Checkboxes
        if isinstance(value, bool):
            # Previous total 1.3. New Global is 1.4. Diff = -0.1. 
            y_offset_correction = 1.3 
            x_offset_correction = -1.5

        # 2. Footer (City/Date)
        footer_keys = ["cidade_proposta_final", "dia_proposta_final", "mes_proposta_final", "ano_proposta_final"]
        if key in footer_keys:
            y_offset_correction = -0.5 
            if key == "cidade_proposta_final":
                x_offset_correction -= 8.0
            else:
                x_offset_correction += 3.0 
            
        # 3. Payment Rows (General Vertical Move)
        # Check if is payment row key
        result_up_keys = ["sinal_l1", "sinal_l2", "sinal_bloco2_qtd", "sinal_bloco2_valor_parcela", "sinal_bloco2_dia", "sinal_bloco2_mes", "sinal_bloco2_ano", "sinal_bloco2_periodicidade",
                          "entrada_qtd", "entrada_valor_parcela", "entrada_dia", "entrada_mes", "entrada_ano", "entrada_periodicidade",
                          "saldo_qtd", "saldo_valor_parcela", "saldo_dia", "saldo_mes", "saldo_ano", "saldo_periodicidade", "saldo_tipo",
                          "saldo_l2_qtd", "saldo_l2_valor_parcela", "saldo_l2_dia", "saldo_l2_mes", "saldo_l2_ano", "saldo_l2_periodicidade", "saldo_l2_tipo"
                         ]
        is_payment_row = False
        for k in result_up_keys:
            if k in key:
                is_payment_row = True
                break
        
        if is_payment_row:
             y_offset_correction -= 1.0 # Move up by 1.0mm
             
        # 4. Section Header Values
        header_keys = ["valor_sinal", "sinal_bloco2_valor", "valor_total_entrada", "valor_saldo_parcelar"]
        if key in header_keys:
             y_offset_correction -= 0.6 

        # --- Centering offsets for Columns ---
        # If it is a payment column, we move the anchor to the approximate center and use drawCentredString
        centering_active = False
        if is_payment_col:
            centering_active = True
            # Add specific shifts to reach visual center from the "Average Left"
            if key in column_groups["qtd"]:
                x_offset_correction += 7.5
            elif key in column_groups["valor"]:
                x_offset_correction += 13.0
            elif key in column_groups["dia"]:
                x_offset_correction += 3.5
            elif key in column_groups["mes"]:
                x_offset_correction += 3.5
            elif key in column_groups["ano"]:
                x_offset_correction += 5.0
            elif key in column_groups["periodicidade"]:
                x_offset_correction += 8.0
            elif key in column_groups["tipo"]:
                x_offset_correction += 9.75  # Fine-tuned for "REAJUSTÁVEL"

        # --- Font Size Logic ---
        # Default font size is 10
        font_size = 10
        
        # Format email as lowercase and smaller font size to fit correctly
        email_keys = ['email_proponente', 'email_segundo']
        if key in email_keys:
            text_to_draw = text_to_draw.lower()
            font_size = 8
            
        c.setFont("Helvetica", font_size)

        # Draw
        x_pt = (x_mm + x_offset_correction) * mm
        y_pt = height - ((y_mm + y_offset_correction) * mm) 
        
        if centering_active:
            # For centering, x_pt is the center. We need rect to be centered too?
            # draw_cleaning_rect logic assumes x_pt is left.
            # If centering_active, we should adjust rect x_pt.
            # Actually, standard rect guessing draws rightwards.
            # If we center text, we should probably center rect too, or draw distinct rect.
            # Or simpler: for centered cols, use a fixed width centered at x_pt.
            pass # See below logic
            c.drawCentredString(x_pt, y_pt, text_to_draw)
        else:
            c.drawString(x_pt, y_pt, text_to_draw)

    # Iterate over data and draw
    print(f"[DEBUG] Drawing {len(data)} fields. Keys: {list(data.keys())}")
    for key, value in data.items():
        if key in positions:
            draw_text(key, value)
        else:
            print(f"[WARN] Key '{key}' not in positions.json, skipping.")
        
    c.save()
    print(f"PDF generated: {output_filename}")

if __name__ == "__main__":
    # Test Data based on the fields we mapped
    # Full Test Data based on all fields in posicoes_campos.json
    test_data = {
        # Proponente 1
        "nome_proponente": "JOÃO DA SILVA COMPLETO",
        "cpf_cnpj_proponente": "123.456.789-00",
        "rg_proponente": "321654987",
        "sexo_fem_proponente": False,
        "sexo_masc_proponente": True,
        "naturalidade_proponente": "SÃO PAULO",
        "uf_naturalidade_proponente": "SP",
        "orgao_emissor_proponente": "SSP/SP",
        "nacionalidade_proponente": "BRASILEIRO",
        "data_nascimento_proponente": "01/01/1980",
        "estado_civil_proponente": "CASADO",
        "regime_casamento_proponente": "COMUNHÃO PARCIAL",
        "profissao_proponente": "PROGRAMADOR",
        "endereco_residencial_proponente": "RUA DOS TESTES, 100",
        "numero_endereco_proponente": "100",
        "bairro_proponente": "BELAVISTA",
        "cidade_proponente": "CAMPINAS",
        "uf_endereco_proponente": "SP",
        "cep_proponente": "13000-000",
        "fone1_ddd_proponente": "11",
        "fone1_numero_proponente": "99999-0001",
        "fone2_ddd_proponente": "11",
        "fone2_numero_proponente": "99999-0002",
        "fone_comercial_ddd_proponente": "11",
        "fone_comercial_numero_proponente": "3333-3333",
        "local_trabalho_proponente": "EMPRESA TESTE LTDA",
        "email_proponente": "joao@teste.com",
        "nome_referencia_proponente": "MARIA DA SILVA",
        "fone_referencia_ddd_proponente": "11",
        "fone_referencia_numero_proponente": "98888-8888",
        "parentesco_referencia_proponente": "MÃE",
        "tipo_conjuge": True,
        "tipo_segundo_proponente": False,
        "tipo_procurador": False,
        
        # Segundo Proponente / Conjuge
        "nome_segundo": "MARIA DA SILVA COMPLETA",
        "sexo_fem_segundo": True,
        "sexo_masc_segundo": False,
        "cpf_cnpj_segundo": "987.654.321-00",
        "rg_segundo": "789456123",
        "orgao_emissor_segundo": "SSP/RJ",
        "naturalidade_segundo": "RIO DE JANEIRO",
        "uf_naturalidade_segundo": "RJ",
        "nacionalidade_segundo": "BRASILEIRA",
        "data_nascimento_segundo": "01/02/1985",
        "estado_civil_segundo": "CASADA",
        "regime_casamento_segundo": "COMUNHÃO PARCIAL",
        "profissao_segundo": "ENGENHEIRA",
        "endereco_residencial_segundo": "RUA DOS TESTES, 100",
        "numero_endereco_segundo": "100",
        "bairro_segundo": "BELAVISTA",
        "cidade_segundo": "CAMPINAS",
        "uf_endereco_segundo": "SP",
        "cep_segundo": "13000-000",
        "fone1_ddd_segundo": "21",
        "fone1_numero_segundo": "97777-7777",
        "fone2_ddd_segundo": "21",
        "fone2_numero_segundo": "96666-6666",
        "fone_comercial_ddd_segundo": "21",
        "fone_comercial_numero_segundo": "3444-4444",
        "local_trabalho_segundo": "CONSTRUTORA XYZ",
        "email_segundo": "maria@teste.com",
        "nome_referencia_segundo": "JOSÉ DA SILVA",
        "fone_referencia_ddd_segundo": "21",
        "fone_referencia_numero_segundo": "95555-5555",
        "parentesco_referencia_segundo": "PAI",
        
        # Empreendimento
        "empreendimento": "VALLE DO IPITINGA",
        "cidade_empreendimento": "ANANINDEUA",
        "estado_empreendimento": "PA",
        "lote": "05",
        "quadra": "12",
        "area": "150.00",
        "logradouro": "NOVA RUA 2",
        "valor_inicial": "120.000,00",
        "valor_sinal": "12.000,00",
        
        # Sinal Linha 1
        "sinal_l1_qtd_parcelas": "01",
        "sinal_l1_valor_parcela": "5.000,00",
        "sinal_l1_dia": "17",
        "sinal_l1_mes": "01",
        "sinal_l1_ano": "2025",
        "sinal_l1_periodicidade": "ÚNICA",
        
        # Sinal Linha 2
        "sinal_l2_qtd_parcelas": "02",
        "sinal_l2_valor_parcela": "3.500,00",
        "sinal_l2_dia": "17",
        "sinal_l2_mes": "02",
        "sinal_l2_ano": "2025",
        "sinal_l2_periodicidade": "MENSAL",
        
        # Sinal Bloco 2
        "sinal_bloco2_valor": "10.000,00",
        "sinal_bloco2_qtd_parcelas": "05",
        "sinal_bloco2_valor_parcela": "2.000,00",
        "sinal_bloco2_dia": "20",
        "sinal_bloco2_mes": "03",
        "sinal_bloco2_ano": "2025",
        "sinal_bloco2_periodicidade": "MENSAL",
        
        # Entrada
        "valor_total_entrada": "22.000,00",
        "entrada_qtd_parcelas": "04",
        "entrada_valor_parcela": "5.500,00",
        "entrada_dia": "15",
        "entrada_mes": "04",
        "entrada_ano": "2025",
        "entrada_periodicidade": "MENSAL",
        
        # Saldo
        "valor_saldo_parcelar": "98.000,00",
        "saldo_qtd_parcelas": "120",
        "saldo_valor_parcela": "1.500,00",
        "saldo_dia": "10",
        "saldo_mes": "05",
        "saldo_ano": "2025",
        "saldo_periodicidade": "MENSAL",
        "saldo_tipo_parcela": "REAJ.",
        
        # Saldo Linha 2
        "saldo_l2_qtd_parcelas": "12",
        "saldo_l2_valor_parcela": "5.000,00",
        "saldo_l2_dia": "10",
        "saldo_l2_mes": "12",
        "saldo_l2_ano": "2025",
        "saldo_l2_periodicidade": "ANUAL",
        "saldo_l2_tipo_parcela": "FIXA",
        
        # Final / Rodapé
        "cidade_proposta_final": "Ananindeua",
        "dia_proposta_final": "17",
        "mes_proposta_final": "Janeiro",
        "ano_proposta_final": "25"
    }
    
    if os.path.exists("PROPOSTA LIMPA.jpg") and os.path.exists("posicoes_campos.json"):
        generate_pdf_reportlab(test_data, "PROPOSTA LIMPA.jpg", "posicoes_campos.json")
    else:
        print("Missing files.")
