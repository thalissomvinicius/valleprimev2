import jsPDF from 'jspdf';
import logo from '../assets/Valle-logo-azul.png';

export const generateResidenceDeclaration = async (data, customCityUF = null, customDate = null, obraName = null, residenceReason = 'option1', residenceReasonOther = '') => {
    try {
        const doc = new jsPDF();
        const margin = 10;
        const pageWidth = doc.internal.pageSize.width;
        const contentWidth = pageWidth - (margin * 2);

        // ... (getImageData helper remains the same)
        const getImageData = (url) => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.src = url;
                img.crossOrigin = "Anonymous";
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                };
                img.onerror = reject;
            });
        };

        // 1. Header (Logo) - Center scaled
        try {
            const logoData = await getImageData(logo);
            const logoW = 40;
            const logoH = 14;
            doc.addImage(logoData, 'PNG', (pageWidth - logoW) / 2, 8, logoW, logoH);
        } catch (e) {
            console.warn("Logo logic skipped", e);
        }

        // 2. Title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text("DECLARAÇÃO DE RESIDÊNCIA", pageWidth / 2, 32, { align: "center" });

        // 3. Date Header (Right Aligned with underline)
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);

        let dateText = "";
        let cityDisplay = customCityUF ? customCityUF.toUpperCase() : "_________________________";

        if (customDate) {
            const [year, month, day] = customDate.split('-');
            const meses = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
            dateText = `${day} DE ${meses[parseInt(month) - 1]} DE ${year}.`;
        } else {
            const today = new Date();
            const dia = today.getDate().toString().padStart(2, '0');
            const meses = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
            const mesStr = meses[today.getMonth()];
            const ano = today.getFullYear();
            dateText = `${dia} DE ${mesStr} DE ${ano}.`;
        }

        doc.text(`${cityDisplay}, ${dateText}`, pageWidth - margin, 42, { align: "right" });

        // Helper for boxed sections
        const drawBoxedSection = (startY, title, client) => {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.text(title, margin, startY);

            const boxY = startY + 2;
            const rowH = 8;
            const textYOffset = 5.2; // Adjusted for vertical center
            doc.setLineWidth(0.25);

            // Row 1: NOME
            doc.rect(margin, boxY, contentWidth, rowH);
            doc.setFontSize(8);
            doc.text("NOME:", margin + 2, boxY + 4);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text(client?.nome?.toUpperCase() || "", margin + 18, boxY + textYOffset);

            // Row 2: CPF / RG / ORGAO
            const y2 = boxY + rowH;
            const col1W = 75;
            const col2W = 45;
            doc.rect(margin, y2, contentWidth, rowH);
            doc.line(margin + col1W, y2, margin + col1W, y2 + rowH);
            doc.line(margin + col1W + col2W, y2, margin + col1W + col2W, y2 + rowH);

            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.text("CPF:", margin + 2, y2 + 4);
            doc.text("RG:", margin + col1W + 2, y2 + 4);
            doc.text("ÓRGÃO EXPED:", margin + col1W + col2W + 2, y2 + 4);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            // CPF and CEP come already formatted from the form (with masks)
            doc.text(client?.cpf || "", margin + 12, y2 + textYOffset);
            doc.text(client?.rg || "", margin + col1W + 10, y2 + textYOffset);
            doc.text(client?.orgao || "", margin + col1W + col2W + 28, y2 + textYOffset);

            // Row 3: ENDEREÇO
            const y3 = y2 + rowH;
            doc.rect(margin, y3, contentWidth, rowH);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.text("ENDEREÇO:", margin + 2, y3 + 4);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text(client?.endereco?.toUpperCase() || "", margin + 22, y3 + textYOffset);

            // Row 4: BAIRRO / CEP / CIDADE-UF
            const y4 = y3 + rowH;
            const bW = 65;
            const cW = 40;
            doc.rect(margin, y4, contentWidth, rowH);
            doc.line(margin + bW, y4, margin + bW, y4 + rowH);
            doc.line(margin + bW + cW, y4, margin + bW + cW, y4 + rowH);

            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.text("BAIRRO:", margin + 2, y4 + 4);
            doc.text("CEP:", margin + bW + 2, y4 + 4);
            doc.text("CIDADE-UF:", margin + bW + cW + 2, y4 + 4);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text(client?.bairro?.toUpperCase() || "", margin + 16, y4 + textYOffset);
            // CEP comes already formatted from the form (with mask)
            doc.text(client?.cep || "", margin + bW + 10, y4 + textYOffset);
            const cityUF = client?.cidade ? `${client.cidade.toUpperCase()} - ${client.uf.toUpperCase()}` : "-";
            doc.text(cityUF, margin + bW + cW + 22, y4 + textYOffset);

            return y4 + rowH + 10;
        };

        // 4. Client Sections
        let currentY = drawBoxedSection(52, "1º COMPRADOR:", data.p1);
        currentY = drawBoxedSection(currentY, "2º COMPRADOR /CONJUGE OU REPRESENTANTE LEGAL.", data.p2 || {});

        // 5. Lot/Quadra/Empreendimento Section
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);

        // First line: LOTE and QUADRA
        doc.text("LOTE/TERRENO:", margin, currentY);
        doc.text("________________________", margin + 38, currentY);

        doc.text("QUADRA:", margin + 95, currentY);
        doc.text("________________________", margin + 118, currentY);

        // Values above underlines
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.text(data.lote?.toString() || "", margin + 42, currentY - 1);
        doc.text(data.quadra?.toString() || "", margin + 125, currentY - 1);

        // Second line: EMPREENDIMENTO
        currentY += 10;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("EMPREENDIMENTO:", margin, currentY);
        doc.text("________________________________________________", margin + 50, currentY);

        // Value above underline
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.text(obraName?.toUpperCase() || "", margin + 54, currentY - 1);

        // 6. Main Disclaimer Text
        currentY += 12;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        const disclaimer = "EU, COMPRADOR ACIMA QUALIFICADO, VENHO ATRAVÉS DESTA DECLARAÇÃO, QUE RESIDO NO ENDEREÇO TAMBÉM ACIMA QUALIFICADO, E PELO MOTIVO DESCRITO ABAIXO NÃO POSSUO COMPROVANTE DE ENDEREÇO.";
        const splitDisclaimer = doc.splitTextToSize(disclaimer, contentWidth);
        doc.text(splitDisclaimer, margin, currentY);

        // 7. Checkbox Options with marking logic
        currentY += 15;
        const options = [
            { key: 'option1', text: "NÃO RESIDO EM ENDEREÇO FIXO/PRÓPRIO (LOCATÁRIO);" },
            { key: 'option2', text: "BAIRRO ONDE RESIDO NÃO POSSUI, REDE DE ÁGUA OU ELÉTRICA REGULARIZADA PELA PREFEITURA;" },
            { key: 'option3', text: "DECLARO QUE RESIDO NO ENDEREÇO ACIMA CITADO;" },
            { key: 'outros', text: residenceReason === 'outros' && residenceReasonOther ? `OUTROS: ${residenceReasonOther}` : "OUTROS:_____________________________________________________________________________" }
        ];

        options.forEach((option, idx) => {
            const optY = currentY + (idx * 10);
            doc.rect(margin, optY - 5.5, 7, 7); // Box

            // Mark the selected checkbox with an X
            if (option.key === residenceReason) {
                doc.setFont("helvetica", "bold");
                doc.setFontSize(14);
                doc.text("X", margin + 1.5, optY - 0.5);
            }

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text(option.text, margin + 11, optY);
        });

        // 8. Signatures Block
        currentY += 55;
        doc.line(margin, currentY, margin + 80, currentY);
        doc.line(pageWidth - margin - 80, currentY, pageWidth - margin, currentY);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("1º COMPRADOR", margin + 40, currentY + 5, { align: "center" });
        doc.text("2º COMPRADOR/CONJUGE/REPR.LEGAL.", pageWidth - margin - 40, currentY + 5, { align: "center" });

        // 9. Witnesses Block
        currentY += 20;
        doc.text("TESTEMUNHAS:", margin, currentY);

        currentY += 15;
        // Witness lines side by side
        doc.line(margin, currentY, margin + 85, currentY);
        doc.line(pageWidth - margin - 85, currentY, pageWidth - margin, currentY);

        doc.setFontSize(10);
        doc.text("NOME:", margin, currentY + 5);
        doc.text("CPF:", margin, currentY + 11);

        doc.text("NOME:", pageWidth - margin - 85, currentY + 5);
        doc.text("CPF:", pageWidth - margin - 85, currentY + 11);

        // Finalize
        const pdfBlobUrl = doc.output('bloburl');
        window.open(pdfBlobUrl, '_blank');

    } catch (error) {
        console.error("Erro ao gerar declaração:", error);
        alert("Erro ao gerar o PDF. Verifique se os dados estão completos.");
    }
};
