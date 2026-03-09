from sqlalchemy import Column, Integer, String, Date, ForeignKey, Float
from sqlalchemy.orm import relationship
from database import Base

class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    senha_hash = Column(String)
    tipo = Column(String) 
    crmv = Column(String, nullable=True) 

    pets = relationship("Pet", back_populates="tutor", foreign_keys='Pet.tutor_id')
    registros_criados = relationship("Registro", back_populates="veterinario")

class Pet(Base):
    __tablename__ = "pets"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, index=True)
    especie = Column(String)
    raca = Column(String, nullable=True)
    microchip = Column(String, nullable=True)
    data_nascimento = Column(Date, nullable=True)
    sexo = Column(String)
    foto = Column(String, nullable=True) # <-- NOVA COLUNA AQUI
    tutor_id = Column(Integer, ForeignKey("usuarios.id"))

    tutor = relationship("Usuario", back_populates="pets", foreign_keys=[tutor_id])
    registros = relationship("Registro", back_populates="pet")

class Registro(Base):
    __tablename__ = "registros"

    id = Column(Integer, primary_key=True, index=True)
    tipo = Column(String) 
    nome = Column(String)
    data = Column(Date)
    proxima_data = Column(Date, nullable=True)
    peso = Column(Float, nullable=True)
    anotacoes = Column(String, nullable=True)
    
    pet_id = Column(Integer, ForeignKey("pets.id"))
    veterinario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)

    pet = relationship("Pet", back_populates="registros")
    veterinario = relationship("Usuario", back_populates="registros_criados")