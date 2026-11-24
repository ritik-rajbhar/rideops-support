from datetime import datetime

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

SNAPSHOT_AT = datetime(2026, 9, 30, 23, 59)
BASELINE_START = datetime(2026, 7, 19)
BACKTEST_START = datetime(2026, 9, 1)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", populate_by_name=True)

    access_code: str | None = Field(default=None, validation_alias="ACCESS_CODE")
    data_path: str | None = Field(default=None, validation_alias="RIDEOPS_DATA_PATH")
    database_url: str = Field(default="sqlite:///./rideops.db", validation_alias="DATABASE_URL")
    warm_reports: bool = Field(default=False, validation_alias="WARM_REPORTS")

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, value: str) -> str:
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value.removeprefix(prefix)
        return value
