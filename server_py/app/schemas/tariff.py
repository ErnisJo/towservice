from pydantic import BaseModel


class TariffBase(BaseModel):
    base: float
    perKm: float
    per3min: float


class TariffResponse(TariffBase):
    pass

    class Config:
        from_attributes = True
