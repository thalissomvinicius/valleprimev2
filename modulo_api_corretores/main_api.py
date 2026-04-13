"""API FastAPI para integração de corretores"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from integracao_corretores import router as corretores_router

app = FastAPI(
    title="VallePrime API - Corretores",
    description="API de integração com banco UAU para dados de corretores",
    version="2.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rotas
app.include_router(corretores_router, prefix="/api/integracao")

@app.get("/health")
async def health_check():
    """Health check da API"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "service": "valleprime-api"
    }

@app.get("/")
async def root():
    """Rota raiz"""
    return {
        "message": "VallePrime API - Corretores",
        "docs": "/docs",
        "health": "/health"
    }

from datetime import datetime
