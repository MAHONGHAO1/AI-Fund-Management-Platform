"""Loopback-only local API and frontend host for AI Fund Management Platform."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.staticfiles import StaticFiles

import fund_service


ROOT = Path(__file__).resolve().parent
FRONTEND_DIST = ROOT / "frontend" / "dist"
ALLOWED_ORIGINS = {
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:4173", "http://127.0.0.1:4173",
    "http://localhost:8766", "http://127.0.0.1:8766",
}


class Holding(BaseModel):
    code: str = Field(min_length=1, max_length=16)
    name: str = Field(min_length=1, max_length=100)
    amount: float = Field(ge=0)
    hold_ret: float = Field(default=0)
    cum_profit: float = Field(default=0)


class PortfolioUpdate(BaseModel):
    holdings: list[Holding] = Field(min_length=1, max_length=100)


class AdviceRequest(BaseModel):
    api_key: str = Field(default="", max_length=500)
    provider: Literal["glm", "dashscope"] = "glm"


def create_app() -> FastAPI:
    app = FastAPI(title="AI Fund local workbench", version="0.3.0", docs_url=None, redoc_url=None)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])

    @app.middleware("http")
    async def reject_nonlocal_origins(request, call_next):
        origin = request.headers.get("origin")
        if origin and origin not in ALLOWED_ORIGINS:
            return JSONResponse({"detail": "仅允许本机工作台来源访问"}, status_code=403)
        return await call_next(request)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=sorted(ALLOWED_ORIGINS),
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["Content-Type"],
    )

    @app.get("/api/health")
    def health():
        return {"status": "ok", "app": "AI 智选基金助手", "version": "0.3.0", "scope": "loopback"}

    @app.get("/api/portfolio")
    def portfolio():
        return fund_service.get_portfolio()

    @app.put("/api/portfolio")
    def update_portfolio(request: PortfolioUpdate):
        try:
            return fund_service.update_portfolio([holding.model_dump() for holding in request.holdings])
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.post("/api/portfolio/reset")
    def reset_portfolio():
        return fund_service.reset_portfolio()

    @app.post("/api/data/refresh")
    def refresh_data():
        return {"refresh_token": fund_service.refresh_data()}

    @app.get("/api/analysis")
    def analysis():
        try:
            rows = fund_service.analysis_rows()
            return {"rows": rows, "summary": fund_service.analysis_summary(rows)}
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"数据分析暂不可用：{type(exc).__name__}: {exc}") from exc

    @app.get("/api/funds/{code}")
    def fund_detail(code: str):
        try:
            normalized = fund_service.advisor.normalize_fund_code(code)
            row = next((item for item in fund_service.analysis_rows() if item["代码"] == normalized), None)
            if row is None:
                raise KeyError("当前组合中没有该基金")
            return row
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/api/funds/{code}/history")
    def fund_history(code: str, days: int = 365):
        if days not in {30, 90, 365, 1095, 0}:
            raise HTTPException(status_code=422, detail="days 仅支持 30、90、365、1095 或 0（全部）")
        try:
            return fund_service.fund_history(code, days)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"净值历史暂不可用：{type(exc).__name__}: {exc}") from exc

    @app.post("/api/funds/{code}/advice")
    def advice(code: str, request: AdviceRequest):
        try:
            # The API key is used for this request only; it is never stored or logged.
            return fund_service.advice(code, request.api_key, request.provider)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"建议生成暂不可用：{type(exc).__name__}: {exc}") from exc

    @app.get("/api/export/markdown")
    def export_markdown():
        rows = fund_service.analysis_rows()
        state = fund_service.get_portfolio()
        report = fund_service.advisor.build_markdown_report(rows, synthetic_portfolio=state["synthetic"])
        return Response(report, media_type="text/markdown; charset=utf-8",
                        headers={"Content-Disposition": "attachment; filename=fund-analysis.md"})

    if FRONTEND_DIST.is_dir() and (FRONTEND_DIST / "index.html").is_file():
        app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("fund_web:app", host="127.0.0.1", port=int(os.getenv("FUND_WEB_PORT", "8766")), reload=False)
