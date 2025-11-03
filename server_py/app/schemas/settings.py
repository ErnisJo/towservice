from pydantic import BaseModel


class SupportBase(BaseModel):
    phone: str
    email: str


class SupportResponse(SupportBase):
    pass

    class Config:
        from_attributes = True


class InfoBase(BaseModel):
    about: str
    version: str
    company: str


class InfoResponse(InfoBase):
    pass

    class Config:
        from_attributes = True
