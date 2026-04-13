from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import Dict, List
from sqlalchemy.exc import IntegrityError
import models
import schemas
from database import engine, get_db

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="PetCare Plus API")

origens_permitidas = [
    "http://localhost:5500", # Para você testar no seu PC
    "https://petcarev.netlify.app" # <-- COLOQUE SEU LINK DO NETLIFY AQUI (sem a barra / no final)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origens_permitidas,
    allow_credentials=True,
    allow_methods=["*"], # Permite GET, POST, PUT, DELETE
    allow_headers=["*"],
)

# --- ROTAS DE USUÁRIOS (Tutores e Veterinários) ---
@app.post("/usuarios/", response_model=schemas.UsuarioResponse)
def criar_usuario(usuario: schemas.UsuarioCreate, db: Session = Depends(get_db)):
    db_usuario = models.Usuario(
        nome=usuario.nome, 
        email=usuario.email, 
        senha_hash=usuario.senha, 
        tipo=usuario.tipo, 
        crmv=usuario.crmv
    )
    db.add(db_usuario)
    db.commit()
    db.refresh(db_usuario)
    return db_usuario

@app.post("/usuarios/{tutor_id}/pets/", response_model=schemas.PetResponse)
def criar_pet_para_tutor(tutor_id: int, pet: schemas.PetCreate, db: Session = Depends(get_db)):
    db_usuario = db.query(models.Usuario).filter(models.Usuario.id == tutor_id).first()
    if not db_usuario:
        raise HTTPException(status_code=404, detail="Tutor não encontrado")
    
    # AQUI FOI REMOVIDA A TRAVA QUE BLOQUEAVA O MICROCHIP EXISTENTE

    db_pet = models.Pet(**pet.model_dump(), tutor_id=tutor_id)
    db.add(db_pet)
    
    try:
        db.commit()
        db.refresh(db_pet)
        return db_pet
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Erro de integridade no banco de dados.")

@app.get("/pets/{pet_id}", response_model=schemas.PetResponse)
def ler_pet(pet_id: int, db: Session = Depends(get_db)):
    db_pet = db.query(models.Pet).filter(models.Pet.id == pet_id).first()
    if db_pet is None:
        raise HTTPException(status_code=404, detail="Pet não encontrado")
    return db_pet

@app.get("/pets/microchip/{microchip}", response_model=schemas.PetResponse)
def buscar_pet_por_microchip(microchip: str, db: Session = Depends(get_db)):
    db_pet = db.query(models.Pet).filter(models.Pet.microchip == microchip).first()
    if db_pet is None:
        raise HTTPException(status_code=404, detail="Nenhum pet encontrado com este microchip")
    return db_pet

# --- ROTAS DE REGISTROS (Ação do Veterinário/Tutor) ---
@app.post("/pets/{pet_id}/registros/", response_model=schemas.RegistroResponse)
async def criar_registro_para_pet(pet_id: int, registro: schemas.RegistroCreate, db: Session = Depends(get_db)):
    db_pet = db.query(models.Pet).filter(models.Pet.id == pet_id).first()
    if db_pet is None:
        raise HTTPException(status_code=404, detail="Pet não encontrado")
    
    db_registro = models.Registro(**registro.model_dump(), pet_id=pet_id)
    db.add(db_registro)
    db.commit()
    db.refresh(db_registro)
    
    # === A MÁGICA ACONTECE AQUI ===
    # Envia o aviso diretamente para o ID do Tutor dono do Pet!
    mensagem = f"Novo registro adicionado para {db_pet.nome}: {registro.nome}"
    await manager.send_personal_message(mensagem, db_pet.tutor_id)
    
    return db_registro
@app.get("/usuarios/{tutor_id}/pets/", response_model=List[schemas.PetResponse])
def listar_pets_do_tutor(tutor_id: int, db: Session = Depends(get_db)):
    pets = db.query(models.Pet).filter(models.Pet.tutor_id == tutor_id).all()
    return pets

@app.put("/pets/{pet_id}", response_model=schemas.PetResponse)
def atualizar_pet(pet_id: int, pet: schemas.PetCreate, db: Session = Depends(get_db)):
    db_pet = db.query(models.Pet).filter(models.Pet.id == pet_id).first()
    if not db_pet:
        raise HTTPException(status_code=404, detail="Pet não encontrado")
    
    for key, value in pet.model_dump().items():
        setattr(db_pet, key, value)
        
    db.commit()
    db.refresh(db_pet)
    return db_pet

@app.delete("/pets/{pet_id}")
def deletar_pet(pet_id: int, db: Session = Depends(get_db)):
    db_pet = db.query(models.Pet).filter(models.Pet.id == pet_id).first()
    if not db_pet:
        raise HTTPException(status_code=404, detail="Pet não encontrado")
        
    db.query(models.Registro).filter(models.Registro.pet_id == pet_id).delete()
    
    db.delete(db_pet)
    db.commit()
    return {"message": "Pet excluído com sucesso"}

# --- ROTAS DE ATUALIZAÇÃO E EXCLUSÃO (REGISTROS) ---

@app.put("/registros/{registro_id}", response_model=schemas.RegistroResponse)
def atualizar_registro(registro_id: int, registro: schemas.RegistroCreate, db: Session = Depends(get_db)):
    db_registro = db.query(models.Registro).filter(models.Registro.id == registro_id).first()
    if not db_registro:
        raise HTTPException(status_code=404, detail="Registro não encontrado")
        
    for key, value in registro.model_dump().items():
        setattr(db_registro, key, value)
        
    db.commit()
    db.refresh(db_registro)
    return db_registro

@app.delete("/registros/{registro_id}")
def deletar_registro(registro_id: int, db: Session = Depends(get_db)):
    db_registro = db.query(models.Registro).filter(models.Registro.id == registro_id).first()
    if not db_registro:
        raise HTTPException(status_code=404, detail="Registro não encontrado")
        
    db.delete(db_registro)
    db.commit()
    return {"message": "Registro excluído com sucesso"}

@app.post("/login/", response_model=schemas.UsuarioResponse)
def login(usuario: schemas.UsuarioLogin, db: Session = Depends(get_db)):
    db_usuario = db.query(models.Usuario).filter(models.Usuario.email == usuario.email).first()
    if not db_usuario or db_usuario.senha_hash != usuario.senha:
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos")
    return db_usuario

@app.get("/pets/", response_model=List[schemas.PetResponse])
def listar_todos_os_pets(db: Session = Depends(get_db)):
    pets = db.query(models.Pet).all()
    return pets

class ConnectionManager:
    def __init__(self):
        # Guarda quem está logado. Formato: {id_do_usuario: [conexao1, conexao2]}
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self.active_connections:
            self.active_connections[user_id].remove(websocket)

    async def send_personal_message(self, message: str, user_id: int):
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id]:
                await connection.send_text(message)

manager = ConnectionManager()

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    await manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_text() # Mantém a conexão aberta escutando
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)