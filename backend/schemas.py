from pydantic import BaseModel
from typing import Optional, List
from datetime import date

# Schemas para Usuário
class UsuarioBase(BaseModel):
    nome: str
    email: str
    tipo: str
    crmv: Optional[str] = None

class UsuarioCreate(UsuarioBase):
    senha: str

class UsuarioResponse(UsuarioBase):
    id: int
    class Config:
        from_attributes = True

# Schemas para Registro (Vacinas, Consultas, Peso)
class RegistroBase(BaseModel):
    tipo: str
    nome: str
    data: date
    proxima_data: Optional[date] = None
    peso: Optional[float] = None
    anotacoes: Optional[str] = None
    veterinario_id: Optional[int] = None

class RegistroCreate(RegistroBase):
    pass

class RegistroResponse(RegistroBase):
    id: int
    pet_id: int
    class Config:
        from_attributes = True

# Schemas para Pet
class PetBase(BaseModel):
    nome: str
    especie: str
    raca: Optional[str] = None
    microchip: Optional[str] = None
    data_nascimento: Optional[date] = None
    sexo: str
    foto: Optional[str] = None

class PetCreate(PetBase):
    pass

class PetResponse(PetBase):
    id: int
    tutor_id: int
    registros: List[RegistroResponse] = []
    class Config:
        from_attributes = True

class UsuarioLogin(BaseModel):
    email: str
    senha: str