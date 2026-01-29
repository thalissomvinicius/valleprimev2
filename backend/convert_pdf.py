import fitz  # PyMuPDF
import os

# Paths
pdf_path = r"C:\Users\thalissom.cruz\Desktop\DISP\site-disponibilidade\dist\assets\PROPOSTA LIMPA.pdf"
output_path = r"C:\Users\thalissom.cruz\Desktop\DISP\site-disponibilidade\backend\PROPOSTA LIMPA.jpg"

# Open PDF
doc = fitz.open(pdf_path)
page = doc.load_page(0)  # First page

# High quality render (300 DPI)
zoom = 300 / 72  # 300 DPI / 72 (default)
matrix = fitz.Matrix(zoom, zoom)
pix = page.get_pixmap(matrix=matrix)

# Save as high quality JPEG
pix.save(output_path, "jpeg")

doc.close()
print(f"Converted successfully to: {output_path}")
print(f"Image size: {pix.width}x{pix.height} pixels")
